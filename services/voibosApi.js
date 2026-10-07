/**
 * Voibos API Client for geoland.at endpoints.
 * Provides a unified fetch wrapper for HTTP requests with timeout, error handling,
 * and JSON serialization. Concrete geo service logic will be implemented across milestones.
 *
 * @module addons/voibosTools/services/voibosApi
 */
class VoibosApi {
    /**
     * @param {Object} [options={}] Configuration options.
     * @param {String} [options.baseUrl="https://voibos.rechenraum.com/voibos/voibos"] Base URL for Voibos services.
     * @param {Number} [options.timeout=15000] Request timeout in milliseconds.
     */
    constructor (options = {}) {
        this.baseUrl = options.baseUrl || "https://voibos.rechenraum.com/voibos/voibos";
        this.timeout = options.timeout || 15000;
        this.headers = {
            "Accept": "application/json",
            ...options.headers || {}
        };
    }

    /**
     * Executes a unified HTTP request.
     * @param {String} endpoint Relative endpoint path or absolute URL or empty string for baseUrl.
     * @param {Object} [config={}] Request configuration.
     * @param {String} [config.method="GET"] HTTP method.
     * @param {Object} [config.params=null] Query parameters.
     * @param {Object} [config.body=null] Request body (will be serialized to JSON).
     * @param {Object} [config.headers={}] Additional HTTP headers.
     * @param {Number} [config.timeout] Custom timeout in ms.
     * @returns {Promise<any>} Parsed JSON response.
     */
    async request (endpoint = "", config = {}) {
        const method = (config.method || "GET").toUpperCase(),
            timeout = config.timeout || this.timeout,
            controller = new AbortController(),
            timeoutId = setTimeout(() => controller.abort(), timeout);

        let url;

        if (endpoint.startsWith("http://") || endpoint.startsWith("https://")) {
            url = new URL(endpoint);
        }
        else if (!endpoint || endpoint === "") {
            url = new URL(this.baseUrl);
        }
        else {
            const base = this.baseUrl.endsWith("/") ? this.baseUrl : `${this.baseUrl}/`,
                path = endpoint.startsWith("/") ? endpoint.substring(1) : endpoint;

            url = new URL(path, base);
        }

        // Append query parameters
        if (config.params && typeof config.params === "object") {
            Object.entries(config.params).forEach(([key, val]) => {
                if (val !== undefined && val !== null) {
                    url.searchParams.append(key, String(val));
                }
            });
        }

        const fetchOptions = {
            method,
            headers: {
                ...this.headers,
                ...config.headers || {}
            },
            signal: controller.signal
        };

        if (config.body && method !== "GET") {
            fetchOptions.headers["Content-Type"] = "application/json";
            fetchOptions.body = typeof config.body === "string"
                ? config.body
                : JSON.stringify(config.body);
        }

        try {
            const response = await fetch(url.toString(), fetchOptions);

            clearTimeout(timeoutId);

            if (!response.ok) {
                let errorDetails = "";

                try {
                    const errorJson = await response.json();

                    errorDetails = errorJson.message || JSON.stringify(errorJson);
                }
                catch {
                    const errorText = await response.text(),
                        match = errorText.match(/<p style="color:red">([\s\S]*?)<\/p>/i);

                    errorDetails = match ? match[1].trim() : errorText;
                }

                throw new Error(
                    `Voibos API request failed [${response.status} ${response.statusText}]: ${errorDetails}`
                );
            }

            const contentType = response.headers.get("content-type") || "";

            if (contentType.includes("application/json")) {
                return await response.json();
            }

            return await response.text();
        }
        catch (error) {
            clearTimeout(timeoutId);

            if (error.name === "AbortError") {
                throw new Error(`Voibos API request timed out after ${timeout}ms`);
            }

            throw error;
        }
    }

    /**
     * Unified GET request.
     * @param {String} [endpoint=""] API endpoint.
     * @param {Object} [params] Query parameters.
     * @returns {Promise<any>} Response data.
     */
    get (endpoint = "", params = {}) {
        return this.request(endpoint, {method: "GET", params});
    }

    /**
     * Unified POST request.
     * @param {String} [endpoint=""] API endpoint.
     * @param {Object} [body] Request payload.
     * @param {Object} [params] Query parameters.
     * @returns {Promise<any>} Response data.
     */
    post (endpoint = "", body = {}, params = {}) {
        return this.request(endpoint, {method: "POST", body, params});
    }

    /* -------------------------------------------------------------
     * Geo-Services
     * ------------------------------------------------------------- */

    /**
     * 1. Höhenservice (Punkthöhe)
     * @param {Object} params Parameters for height service.
     * @param {Array<Number>} [params.coordinate] [x, y] coordinate pair.
     * @param {Number} [params.x] Easting / Rechtswert.
     * @param {Number} [params.y] Northing / Hochwert.
     * @param {String|Number} [params.crs="31287"] CRS EPSG code (e.g. 31287, 31256, 4326).
     * @returns {Promise<Object>} Response containing hoeheDTM, hoeheDSM, deltaH, abfragestatus, etc.
     */
    async fetchElevation (params = {}) {
        let x, y;

        if (Array.isArray(params.coordinate)) {
            [x, y] = params.coordinate;
        }
        else {
            x = params.x;
            y = params.y;
        }

        if (x === undefined || y === undefined) {
            throw new Error("VoibosApi.fetchElevation: Coordinate (x, y) is required");
        }

        const formattedX = typeof x === "number" ? Number(x.toFixed(2)) : x,
            formattedY = typeof y === "number" ? Number(y.toFixed(2)) : y,
            crsCode = String(params.crs || "31287").replace(/^EPSG:/i, ""),
            queryParams = {
                name: "hoehenservice",
                Koordinate: `${formattedX},${formattedY}`,
                CRS: crsCode
            };

        return this.get("", queryParams);
    }

    /**
     * 2. Sonnengang (Sonnenstand)
     * @param {Object} params Parameters for sun position service.
     * @param {Array<Number>} [params.coordinate] [x, y] coordinate pair.
     * @param {Number} [params.x] Easting / Rechtswert.
     * @param {Number} [params.y] Northing / Hochwert.
     * @param {String|Date} [params.date] Date string (YYYY-MM-DD) or Date object.
     * @param {String} [params.time="12:00"] Time string (HH:mm).
     * @param {Number} [params.height=2.0] Height above ground in meters.
     * @param {String|Number} [params.crs="31287"] CRS EPSG code.
     * @returns {Promise<Object>} Response containing horizont, sonnenstunden, etc.
     */
    async fetchSunPosition (params = {}) {
        let x, y;

        if (Array.isArray(params.coordinate)) {
            [x, y] = params.coordinate;
        }
        else {
            x = params.x;
            y = params.y;
        }

        if (x === undefined || y === undefined) {
            throw new Error("VoibosApi.fetchSunPosition: Coordinate (x, y) is required");
        }

        let dateObj;

        if (params.date instanceof Date) {
            dateObj = params.date;
        }
        else if (typeof params.date === "string" && params.date.length >= 10) {
            // YYYY-MM-DD
            const [year, month, day] = params.date.split("-").map(Number);

            dateObj = new Date(year, month - 1, day);
        }
        else {
            dateObj = new Date();
        }

        const month = String(dateObj.getMonth() + 1).padStart(2, "0"),
            day = String(dateObj.getDate()).padStart(2, "0"),
            timeStr = params.time || `${String(dateObj.getHours()).padStart(2, "0")}:${String(dateObj.getMinutes()).padStart(2, "0")}`,
            voibosDatum = `${month}-${day}-${timeStr}`,
            formattedX = typeof x === "number" ? Number(x.toFixed(2)) : x,
            formattedY = typeof y === "number" ? Number(y.toFixed(2)) : y,
            crsCode = String(params.crs || "31287").replace(/^EPSG:/i, ""),
            queryParams = {
                name: "sonnengang",
                Koordinate: `${formattedX},${formattedY}`,
                CRS: crsCode,
                output: "JSONDownload",
                Datum: voibosDatum
            };

        if (params.height !== undefined && params.height !== null) {
            queryParams.H = String(params.height);
        }

        return this.get("", queryParams);
    }

    /**
     * Builds full web URL for a Voibos service endpoint (suitable for opening in a browser).
     * @param {String} serviceName Service name (e.g. "sonnengang", "hoehenservice").
     * @param {Object} [params={}] Service parameters.
     * @returns {String} Complete URL.
     */
    buildVoibosUrl (serviceName, params = {}) {
        let x, y;

        if (Array.isArray(params.coordinate)) {
            [x, y] = params.coordinate;
        }
        else {
            x = params.x;
            y = params.y;
        }

        const url = new URL(this.baseUrl);

        url.searchParams.append("name", serviceName);

        if (x !== undefined && y !== undefined) {
            const formattedX = typeof x === "number" ? Number(x.toFixed(2)) : x,
                formattedY = typeof y === "number" ? Number(y.toFixed(2)) : y;

            url.searchParams.append("Koordinate", `${formattedX},${formattedY}`);
        }

        if (params.crs) {
            url.searchParams.append("CRS", String(params.crs).replace(/^EPSG:/i, ""));
        }

        if (serviceName === "sonnengang") {
            let dateObj;

            if (params.date instanceof Date) {
                dateObj = params.date;
            }
            else if (typeof params.date === "string" && params.date.length >= 10) {
                const [year, month, day] = params.date.split("-").map(Number);

                dateObj = new Date(year, month - 1, day);
            }
            else {
                dateObj = new Date();
            }

            const month = String(dateObj.getMonth() + 1).padStart(2, "0"),
                day = String(dateObj.getDate()).padStart(2, "0"),
                timeStr = params.time || `${String(dateObj.getHours()).padStart(2, "0")}:${String(dateObj.getMinutes()).padStart(2, "0")}`,
                voibosDatum = `${month}-${day}-${timeStr}`;

            url.searchParams.append("Datum", voibosDatum);

            if (params.height !== undefined && params.height !== null) {
                url.searchParams.append("H", String(params.height));
            }
        }
        else if (serviceName === "profilservice" && Array.isArray(params.coordinates) && params.coordinates.length >= 2) {
            const wktPoints = params.coordinates.map(([ptX, ptY]) => {
                const fx = typeof ptX === "number" ? ptX.toFixed(2) : ptX,
                    fy = typeof ptY === "number" ? ptY.toFixed(2) : ptY;

                return `${fx} ${fy}`;
            }).join(", ");

            url.searchParams.append("Polygonzug", `LINESTRING(${wktPoints})`);
            url.searchParams.append("Stuetzpunktabstand", String(params.stepDistance || params.step || 10));
            url.searchParams.append("Beschriftung", "ja");
            url.searchParams.append("Ueberhoehung", String(params.exaggeration || 1));
        }

        return url.toString();
    }

    /**
     * Extracts base64 PNG graphics from Voibos HTML response.
     * @param {String} html Voibos response HTML string.
     * @returns {Object} Object with panorama, months, distance data URLs or nulls.
     */
    extractSunGraphicsFromHtml (html) {
        if (!html || typeof html !== "string") {
            return {panorama: null, months: null, distance: null};
        }

        /**
         * Extracts image data URL by tag ID.
         * @param {String} id ID of the img tag.
         * @returns {String|null} Clean base64 data URL or null.
         */
        function extract (id) {
            const tagMatch = html.match(new RegExp(`<img[^>]*\\bid=["']${id}["'][^>]*>`, "i"));

            if (!tagMatch) {
                return null;
            }

            const srcMatch = tagMatch[0].match(/src=["']([^"']+)["']/i);

            if (srcMatch && srcMatch[1].startsWith("data:image/png;base64,")) {
                const clean = srcMatch[1].replace(/\r?\n/g, "");

                return clean.length > 30 ? clean : null;
            }

            return null;
        }

        return {
            panorama: extract("panorama"),
            months: extract("months"),
            distance: extract("distance")
        };
    }

    /**
     * Fetches graphic visualizations (panorama, months, distance) from Voibos.
     * @param {Object} params Parameters for sun position service.
     * @returns {Promise<Object>} Object containing panorama, months, distance base64 image strings.
     */
    async fetchSunGraphics (params = {}) {
        let x, y;

        if (Array.isArray(params.coordinate)) {
            [x, y] = params.coordinate;
        }
        else {
            x = params.x;
            y = params.y;
        }

        if (x === undefined || y === undefined) {
            throw new Error("VoibosApi.fetchSunGraphics: Coordinate (x, y) is required");
        }

        let dateObj;

        if (params.date instanceof Date) {
            dateObj = params.date;
        }
        else if (typeof params.date === "string" && params.date.length >= 10) {
            const [year, month, day] = params.date.split("-").map(Number);

            dateObj = new Date(year, month - 1, day);
        }
        else {
            dateObj = new Date();
        }

        const month = String(dateObj.getMonth() + 1).padStart(2, "0"),
            day = String(dateObj.getDate()).padStart(2, "0"),
            timeStr = params.time || `${String(dateObj.getHours()).padStart(2, "0")}:${String(dateObj.getMinutes()).padStart(2, "0")}`,
            voibosDatum = `${month}-${day}-${timeStr}`,
            formattedX = typeof x === "number" ? Number(x.toFixed(2)) : x,
            formattedY = typeof y === "number" ? Number(y.toFixed(2)) : y,
            crsCode = String(params.crs || "31287").replace(/^EPSG:/i, ""),
            queryParams = {
                name: "sonnengang",
                Koordinate: `${formattedX},${formattedY}`,
                CRS: crsCode,
                Output: "Horizont,Sonnenzeit,Lage",
                Datum: voibosDatum
            };

        if (params.height !== undefined && params.height !== null) {
            queryParams.H = String(params.height);
        }

        const html = await this.get("", queryParams);

        return this.extractSunGraphicsFromHtml(html);
    }

    /**
     * Parses Voibos sun position response for given time and date.
     * Computes sunrise, sunset, solar noon, and current sun position (azimuth, elevation, direct sun status).
     * @param {Object} response Voibos JSON response.
     * @param {String} [targetTime="12:00"] Target time string (HH:mm).
     * @param {Boolean} [isDST=true] True if Daylight Saving Time (MESZ), false for standard time (MEZ).
     * @returns {Object} Parsed sun analysis results.
     */
    parseSunData (response, targetTime = "12:00", isDST = true) {
        if (!response || !Array.isArray(response.horizont)) {
            return null;
        }

        const timeKey = isDST ? "UhrzeitSonnengangMESZ" : "UhrzeitSonnengangMEZ",
            timeZoneSuffix = isDST ? "MESZ" : "MEZ",
            sunPath = response.horizont.filter(h => h.hoehenwinkelAbfragedatum !== "n/a"),
            aboveHorizon = sunPath.filter(h => Number(h.hoehenwinkelAbfragedatum) > 0);

        /**
         * Converts "HH:mm" to minutes from midnight.
         * @param {String} str Time string.
         * @returns {Number|null} Minutes from midnight or null.
         */
        function parseMinutes (str) {
            if (!str || str === "n/a") {
                return null;
            }
            const [h, m] = str.split(":").map(Number);

            return isNaN(h) || isNaN(m) ? null : h * 60 + m;
        }

        const targetMinutes = parseMinutes(targetTime) ?? 12 * 60;

        // Sunrise & Sunset
        let sunrise = null,
            sunset = null;

        if (aboveHorizon.length > 0) {
            const firstAbove = aboveHorizon[0],
                lastAbove = aboveHorizon[aboveHorizon.length - 1];

            sunrise = {
                time: firstAbove[timeKey],
                azimuth: firstAbove.azimuth,
                elevation: Number(firstAbove.hoehenwinkelAbfragedatum)
            };

            sunset = {
                time: lastAbove[timeKey],
                azimuth: lastAbove.azimuth,
                elevation: Number(lastAbove.hoehenwinkelAbfragedatum)
            };
        }

        // Solar Noon (max elevation)
        let solarNoon = null;

        if (aboveHorizon.length > 0) {
            const maxEntry = aboveHorizon.reduce(
                (max, cur) => Number(cur.hoehenwinkelAbfragedatum) > Number(max.hoehenwinkelAbfragedatum) ? cur : max,
                aboveHorizon[0]
            );

            solarNoon = {
                time: maxEntry[timeKey],
                azimuth: maxEntry.azimuth,
                maxElevation: Number(maxEntry.hoehenwinkelAbfragedatum)
            };
        }

        // Current Sun Position for target time
        let currentPosition = null;

        if (sunPath.length > 0) {
            let closestEntry = null,
                minDiff = Infinity;

            for (const entry of sunPath) {
                const entryMin = parseMinutes(entry[timeKey]);

                if (entryMin !== null) {
                    const diff = Math.abs(entryMin - targetMinutes);

                    if (diff < minDiff) {
                        minDiff = diff;
                        closestEntry = entry;
                    }
                }
            }

            if (closestEntry) {
                const elev = Number(closestEntry.hoehenwinkelAbfragedatum),
                    dsm = Number(closestEntry.hoehenwinkelDSM),
                    dtm = Number(closestEntry.hoehenwinkelDTM),
                    isAboveHorizon = elev > 0,
                    isDirectSun = isAboveHorizon && elev > dsm;

                currentPosition = {
                    azimuth: closestEntry.azimuth,
                    elevation: elev,
                    terrainHorizon: dtm,
                    surfaceHorizon: dsm,
                    isAboveHorizon,
                    isDirectSun,
                    time: closestEntry[timeKey],
                    diffMinutes: minDiff
                };
            }
        }

        return {
            status: response.abfragestatus || "erfolgreich",
            timeZoneSuffix,
            sunrise,
            sunset,
            solarNoon,
            currentPosition,
            monthlySunshine: response["sonnenstunden pro tag im monatsmittel"] || null,
            altitudeInfo: response.abfragehoehe || null,
            dataSource: response.datengrundlage || null,
            flightYear: response.flugjahr || null
        };
    }

    /**
     * 3. Profilservice (Höhenprofil)
     * @param {Object} params Parameters for profile service.
     * @param {Array<Array<Number>>} params.coordinates Array of coordinate pairs [[x, y], ...].
     * @param {Number} [params.stepDistance=10] Sample point distance in meters (Stuetzpunktabstand).
     * @param {Number} [params.exaggeration=1] Vertical exaggeration (Ueberhoehung).
     * @param {String|Number} [params.crs="31287"] CRS EPSG code.
     * @returns {Promise<Object>} Response containing stuetzpunkte array, etc.
     */
    async fetchProfile (params = {}) {
        if (!Array.isArray(params.coordinates) || params.coordinates.length < 2) {
            throw new Error("VoibosApi.fetchProfile: At least 2 coordinates [[x, y], ...] are required");
        }

        const crsCode = String(params.crs || "31287").replace(/^EPSG:/i, ""),
            step = params.stepDistance || params.step || 10,
            wktPoints = params.coordinates.map(([ptX, ptY]) => {
                const fx = typeof ptX === "number" ? ptX.toFixed(2) : ptX,
                    fy = typeof ptY === "number" ? ptY.toFixed(2) : ptY;

                return `${fx} ${fy}`;
            }).join(", "),
            wkt = `LINESTRING(${wktPoints})`,
            queryParams = {
                name: "profilservice",
                Polygonzug: wkt,
                CRS: crsCode,
                Stuetzpunktabstand: String(step),
                Beschriftung: "ja",
                Ueberhoehung: String(params.exaggeration || 1),
                output: "JSONDownload"
            };

        return this.get("", queryParams);
    }

    /**
     * Parses profile response and calculates statistics.
     * @param {Object} response Profile response from Voibos.
     * @returns {Object|null} Parsed profile statistics and points.
     */
    parseProfileData (response) {
        if (!response || !Array.isArray(response.stuetzpunkte) || response.stuetzpunkte.length === 0) {
            return null;
        }

        const points = response.stuetzpunkte.map(pt => ({
            index: pt.stuetzpunktnummer,
            distance: Number(pt["horizontale distanz"] ?? 0),
            x: pt.rechtswert,
            y: pt.hochwert,
            dtm: typeof pt.hoeheDTM === "number" ? pt.hoeheDTM : Number(pt.hoeheDTM),
            dsm: typeof pt.hoeheDSM === "number" ? pt.hoeheDSM : Number(pt.hoeheDSM),
            lineOfSight: typeof pt["hoehe sichtlinie"] === "number" ? pt["hoehe sichtlinie"] : Number(pt["hoehe sichtlinie"]),
            flightYear: pt.flugjahr
        }));

        let minDtm = Infinity,
            maxDtm = -Infinity,
            minDsm = Infinity,
            maxDsm = -Infinity,
            elevationGain = 0,
            elevationLoss = 0;

        for (let i = 0; i < points.length; i++) {
            const p = points[i];

            if (!isNaN(p.dtm)) {
                if (p.dtm < minDtm) {
                    minDtm = p.dtm;
                }
                if (p.dtm > maxDtm) {
                    maxDtm = p.dtm;
                }

                if (i > 0 && !isNaN(points[i - 1].dtm)) {
                    const diff = p.dtm - points[i - 1].dtm;

                    if (diff > 0) {
                        elevationGain += diff;
                    }
                    else {
                        elevationLoss += Math.abs(diff);
                    }
                }
            }

            if (!isNaN(p.dsm)) {
                if (p.dsm < minDsm) {
                    minDsm = p.dsm;
                }
                if (p.dsm > maxDsm) {
                    maxDsm = p.dsm;
                }
            }
        }

        const totalDistance = points[points.length - 1].distance;

        return {
            points,
            totalDistance: Math.round(totalDistance * 10) / 10,
            minDtm: minDtm !== Infinity ? Math.round(minDtm * 10) / 10 : null,
            maxDtm: maxDtm !== -Infinity ? Math.round(maxDtm * 10) / 10 : null,
            minDsm: minDsm !== Infinity ? Math.round(minDsm * 10) / 10 : null,
            maxDsm: maxDsm !== -Infinity ? Math.round(maxDsm * 10) / 10 : null,
            elevationDifference: maxDtm !== -Infinity && minDtm !== Infinity ? Math.round((maxDtm - minDtm) * 10) / 10 : null,
            elevationGain: Math.round(elevationGain * 10) / 10,
            elevationLoss: Math.round(elevationLoss * 10) / 10,
            dataSource: response.datengrundlage || null,
            flightYears: response.flugjahre || null
        };
    }

    /**
     * 4. Wegzeit (Multi-Punkt-Wegzeitberechnung)
     * @returns {Promise<Object>} Response containing travel time details.
     */
    async fetchTravelTime () {
        throw new Error("VoibosApi.fetchTravelTime: Implementation planned for Milestone 4");
    }
}

export const voibosApi = new VoibosApi();
export default voibosApi;
