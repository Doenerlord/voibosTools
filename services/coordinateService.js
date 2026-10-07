import crs from "@masterportal/masterportalapi/src/crs.js";
import {transform as olTransform} from "ol/proj.js";

/**
 * Coordinate service for Voibos tools.
 * Handles coordinate transformations between map CRS (e.g. EPSG:3857) and
 * Austrian standard reference systems used by Voibos services (EPSG:31256, EPSG:31258, EPSG:4326, etc.).
 * Uses Masterportal's built-in @masterportal/masterportalapi crs module with fallback to OpenLayers ol/proj.
 *
 * @module addons/voibosTools/services/coordinateService
 */
export const coordinateService = {
    /**
     * Default map projection.
     */
    DEFAULT_MAP_CRS: "EPSG:3857",

    /**
     * Common reference systems used in Austrian Voibos services.
     */
    CRS: {
        WEB_MERCATOR: "EPSG:3857",
        WGS84: "EPSG:4326",
        MGI_GK_EAST: "EPSG:31256", // MGI / Austria GK East (M34)
        MGI_GK_CENTRAL: "EPSG:31255", // MGI / Austria GK Central (M31)
        MGI_GK_WEST: "EPSG:31254", // MGI / Austria GK West (M28)
        MGI_LAMBERT: "EPSG:31287",
        ETRS89_UTM32N: "EPSG:25832",
        ETRS89_UTM33N: "EPSG:25833"
    },

    /**
     * Checks if coordinates are valid numbers.
     * @param {Array<Number>} coord - [x, y] coordinate pair.
     * @returns {Boolean} True if valid.
     */
    isValidCoordinate (coord) {
        return Array.isArray(coord) &&
            coord.length >= 2 &&
            typeof coord[0] === "number" &&
            !isNaN(coord[0]) &&
            typeof coord[1] === "number" &&
            !isNaN(coord[1]);
    },

    /**
     * Transforms a single coordinate pair [x, y] from sourceCrs to targetCrs.
     * @param {Array<Number>} sourceCoord - [x, y] source coordinate pair.
     * @param {String} sourceCrs - Source CRS code (e.g. "EPSG:3857").
     * @param {String} targetCrs - Target CRS code (e.g. "EPSG:31256").
     * @returns {Array<Number>|null} Transformed coordinate pair [x, y] or null on failure.
     */
    transform (sourceCoord, sourceCrs, targetCrs) {
        if (!this.isValidCoordinate(sourceCoord)) {
            console.warn("[VoibosCoordinateService] Invalid source coordinates:", sourceCoord);
            return null;
        }

        if (!sourceCrs || !targetCrs || sourceCrs === targetCrs) {
            return [sourceCoord[0], sourceCoord[1]];
        }

        // 1. Try Masterportal's built-in CRS transformer
        try {
            if (crs && typeof crs.transform === "function") {
                const transformed = crs.transform(sourceCrs, targetCrs, sourceCoord);

                if (this.isValidCoordinate(transformed)) {
                    return [transformed[0], transformed[1]];
                }
            }
        }
        catch (err) {
            console.warn("[VoibosCoordinateService] crs.transform failed, trying ol/proj fallback:", err);
        }

        // 2. Fallback to OpenLayers transform
        try {
            if (typeof olTransform === "function") {
                const olResult = olTransform(sourceCoord, sourceCrs, targetCrs);

                if (this.isValidCoordinate(olResult)) {
                    return [olResult[0], olResult[1]];
                }
            }
        }
        catch (err) {
            console.error("[VoibosCoordinateService] ol/proj fallback transform also failed:", err);
        }

        return null;
    },

    /**
     * Transforms coordinates from map projection (default EPSG:3857) to target CRS.
     * @param {Array<Number>} sourceCoord - Coordinate in map CRS.
     * @param {String} targetCrs - Target CRS.
     * @param {String} [mapCrs=EPSG:3857] - Map CRS code.
     * @returns {Array<Number>|null} Transformed coordinate or null.
     */
    transformFromMap (sourceCoord, targetCrs, mapCrs = this.DEFAULT_MAP_CRS) {
        return this.transform(sourceCoord, mapCrs, targetCrs);
    },

    /**
     * Transforms coordinates from source CRS to map projection (default EPSG:3857).
     * @param {Array<Number>} sourceCoord - Coordinate in source CRS.
     * @param {String} sourceCrs - Source CRS code.
     * @param {String} [mapCrs=EPSG:3857] - Map CRS code.
     * @returns {Array<Number>|null} Transformed coordinate or null.
     */
    transformToMap (sourceCoord, sourceCrs, mapCrs = this.DEFAULT_MAP_CRS) {
        return this.transform(sourceCoord, sourceCrs, mapCrs);
    },

    /**
     * Transforms an array/chain of coordinates (e.g. for LineString geometry).
     * @param {Array<Array<Number>>} coords - Array of [x, y] coordinates.
     * @param {String} sourceCrs - Source CRS code.
     * @param {String} targetCrs - Target CRS code.
     * @returns {Array<Array<Number>>} Array of transformed coordinates.
     */
    transformCoordinatesChain (coords, sourceCrs, targetCrs) {
        if (!Array.isArray(coords)) {
            return [];
        }

        return coords
            .map(coord => this.transform(coord, sourceCrs, targetCrs))
            .filter(Boolean);
    },

    /**
     * Formats coordinate numbers for display or URL parameter query.
     * @param {Array<Number>} coord - [x, y] coordinate.
     * @param {Number} [decimals=2] - Number of decimals.
     * @returns {String} Formatted string "x, y".
     */
    formatCoordinate (coord, decimals = 2) {
        if (!this.isValidCoordinate(coord)) {
            return "";
        }
        return `${coord[0].toFixed(decimals)}, ${coord[1].toFixed(decimals)}`;
    }
};

export default coordinateService;
