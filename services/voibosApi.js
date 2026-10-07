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
            ...(options.headers || {})
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
                ...(config.headers || {})
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
                    errorDetails = await response.text();
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
     * @returns {Promise<any>}
     */
    get (endpoint = "", params = {}) {
        return this.request(endpoint, {method: "GET", params});
    }

    /**
     * Unified POST request.
     * @param {String} [endpoint=""] API endpoint.
     * @param {Object} [body] Request payload.
     * @param {Object} [params] Query parameters.
     * @returns {Promise<any>}
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

        // Format to 2 decimal places if number
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
     * @param {Object} _params Query parameters for sun position service.
     * @returns {Promise<Object>}
     */
    async fetchSunPosition (_params) {
        throw new Error("VoibosApi.fetchSunPosition: Implementation planned for Milestone 2");
    }

    /**
     * 3. Profilservice (Höhenprofil)
     * @param {Object} _params Query parameters for profile service.
     * @returns {Promise<Object>}
     */
    async fetchProfile (_params) {
        throw new Error("VoibosApi.fetchProfile: Implementation planned for Milestone 3");
    }

    /**
     * 4. Wegzeit (Multi-Punkt-Wegzeitberechnung)
     * @param {Object} _params Query parameters for travel time service.
     * @returns {Promise<Object>}
     */
    async fetchTravelTime (_params) {
        throw new Error("VoibosApi.fetchTravelTime: Implementation planned for Milestone 4");
    }
}

export const voibosApi = new VoibosApi();
export default voibosApi;
