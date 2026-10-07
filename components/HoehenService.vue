<script>
import mapCollection from "@core/maps/js/mapCollection.js";
import VectorLayer from "ol/layer/Vector.js";
import VectorSource from "ol/source/Vector.js";
import Feature from "ol/Feature.js";
import Point from "ol/geom/Point.js";
import {Style, Circle, Fill, Stroke} from "ol/style.js";

import coordinateService from "../services/coordinateService.js";
import voibosApi from "../services/voibosApi.js";

/**
 * HoehenService - Punkthöhenabfrage über Adria (m ü. A.) per Klick auf die Karte.
 * @module addons/voibosTools/components/HoehenService
 */
export default {
    name: "HoehenService",
    data () {
        return {
            map: null,
            vectorSource: null,
            vectorLayer: null,
            mapCheckInterval: null,

            // Query state
            isLoading: false,
            elevationData: null,
            clickedCoordMap: null,
            clickedCoordVoibos: null,
            targetCrs: "EPSG:31287", // Standard Austrian Lambert for nationwide coverage
            errorMessage: null,
            isCopied: false
        };
    },
    mounted () {
        this.initMapAndLayer();
    },
    activated () {
        if (!this.map || !this.vectorLayer) {
            this.initMapAndLayer();
        }
    },
    deactivated () {
        this.cleanup();
    },
    unmounted () {
        this.cleanup();
    },
    methods: {
        /**
         * Initializes OpenLayers map listener and dedicated vector layer.
         */
        initMapAndLayer () {
            this.map = mapCollection.getMap("2D");

            if (!this.map) {
                // Retry if map is still being initialized
                let attempts = 0;

                this.mapCheckInterval = setInterval(() => {
                    attempts++;
                    this.map = mapCollection.getMap("2D");
                    if (this.map) {
                        clearInterval(this.mapCheckInterval);
                        this.setupLayerAndListener();
                    }
                    else if (attempts > 25) {
                        clearInterval(this.mapCheckInterval);
                    }
                }, 200);
                return;
            }

            this.setupLayerAndListener();
        },

        /**
         * Creates vector layer and binds the singleclick listener.
         */
        setupLayerAndListener () {
            if (!this.vectorSource) {
                this.vectorSource = new VectorSource();
            }

            if (!this.vectorLayer) {
                this.vectorLayer = new VectorLayer({
                    source: this.vectorSource,
                    id: "voibos-hoehenservice-layer",
                    name: "Voibos Hoehenservice Marker Layer",
                    alwaysOnTop: true,
                    zIndex: 9999
                });
            }

            // Ensure layer is added to map
            if (this.map && !this.map.getLayers().getArray().includes(this.vectorLayer)) {
                this.map.addLayer(this.vectorLayer);
            }

            // Register singleclick listener
            this.onMapClick = this.handleMapClick.bind(this);
            this.map.on("singleclick", this.onMapClick);
        },

        /**
         * Cleans up map listener, removes vector features and layer from map.
         */
        cleanup () {
            if (this.mapCheckInterval) {
                clearInterval(this.mapCheckInterval);
                this.mapCheckInterval = null;
            }

            if (this.map) {
                if (this.onMapClick) {
                    this.map.un("singleclick", this.onMapClick);
                }
                if (this.vectorSource) {
                    this.vectorSource.clear();
                }
                if (this.vectorLayer) {
                    this.map.removeLayer(this.vectorLayer);
                }
            }
        },

        /**
         * Map click event handler.
         * @param {Object} event OpenLayers MapBrowserEvent
         */
        async handleMapClick (event) {
            const coord = event?.coordinate;

            if (!coordinateService.isValidCoordinate(coord)) {
                return;
            }

            this.clickedCoordMap = coord;
            this.renderMarker(coord);

            // Transform coordinate from EPSG:3857 to Voibos target CRS (EPSG:31287)
            const transformed = coordinateService.transform(coord, "EPSG:3857", this.targetCrs);

            if (!transformed) {
                this.errorMessage = this.$t("additional:modules.tools.voibosTools.elevation.errorGeneric");
                return;
            }

            this.clickedCoordVoibos = transformed;
            await this.queryElevationService(transformed);
        },

        /**
         * Renders pin marker at given coordinates on the dedicated layer.
         * @param {Array<Number>} coord Map coordinate [x, y].
         */
        renderMarker (coord) {
            if (!this.vectorSource) {
                return;
            }

            this.vectorSource.clear();

            const feature = new Feature({
                geometry: new Point(coord)
            });

            feature.setStyle(this.createMarkerStyle());
            this.vectorSource.addFeature(feature);
        },

        /**
         * Creates styled marker with high contrast.
         * @returns {Array<module:ol/style/Style>} Marker style array.
         */
        createMarkerStyle () {
            return [
                new Style({
                    image: new Circle({
                        radius: 10,
                        fill: new Fill({color: "#001B3D"}),
                        stroke: new Stroke({color: "#FFFFFF", width: 3})
                    })
                }),
                new Style({
                    image: new Circle({
                        radius: 4,
                        fill: new Fill({color: "#D6E3FF"})
                    })
                })
            ];
        },

        /**
         * Queries Voibos height service.
         * @param {Array<Number>} coord Voibos coordinate [x, y].
         */
        async queryElevationService (coord) {
            this.isLoading = true;
            this.errorMessage = null;
            this.elevationData = null;

            try {
                const response = await voibosApi.fetchElevation({
                    coordinate: coord,
                    crs: this.targetCrs
                });

                if (response.abfragestatus && response.abfragestatus !== "erfolgreich") {
                    this.errorMessage = response.abfragestatus;
                    if (response.hoeheDTM && response.hoeheDTM !== "n/a") {
                        this.elevationData = response;
                    }
                }
                else {
                    this.elevationData = response;
                }
            }
            catch (error) {
                this.errorMessage = error.message || this.$t("additional:modules.tools.voibosTools.elevation.errorGeneric");
            }
            finally {
                this.isLoading = false;
            }
        },

        /**
         * Resets current query and clears marker.
         */
        reset () {
            this.elevationData = null;
            this.clickedCoordMap = null;
            this.clickedCoordVoibos = null;
            this.errorMessage = null;

            if (this.vectorSource) {
                this.vectorSource.clear();
            }
        },

        /**
         * Copies current coordinates to clipboard.
         */
        async copyCoordinates () {
            if (!this.clickedCoordVoibos) {
                return;
            }

            const text = `Rechtswert: ${this.formatNumber(this.clickedCoordVoibos[0], 2)} m, Hochwert: ${this.formatNumber(this.clickedCoordVoibos[1], 2)} m (${this.targetCrs})`;

            try {
                await navigator.clipboard.writeText(text);
                this.isCopied = true;
                setTimeout(() => {
                    this.isCopied = false;
                }, 2000);
            }
            catch {
                // Clipboard fallback
            }
        },

        /**
         * Formats a number with locale digits.
         * @param {Number|String} val
         * @param {Number} [decimals=1]
         * @returns {String} Formatted number string.
         */
        formatNumber (val, decimals = 1) {
            if (typeof val === "number") {
                return val.toLocaleString("de-AT", {
                    minimumFractionDigits: decimals,
                    maximumFractionDigits: decimals
                });
            }
            return String(val ?? "-");
        }
    }
};
</script>

<template>
    <div
        id="voibos-hoehenservice"
        class="voibos-hoehenservice p-1"
    >
        <!-- Active Hint / Instruction -->
        <div
            class="alert alert-primary d-flex align-items-center mb-3 py-2 px-3"
            role="status"
        >
            <i
                class="bi bi-cursor-fill me-2 fs-5"
                aria-hidden="true"
            />
            <div class="small">
                <strong>{{ $t("additional:modules.tools.voibosTools.elevation.activeHint") }}</strong>
            </div>
        </div>

        <!-- Loading Spinner -->
        <div
            v-if="isLoading"
            class="d-flex flex-column align-items-center justify-content-center p-4 my-2"
        >
            <div
                class="spinner-border text-primary mb-2"
                role="status"
            >
                <span class="visually-hidden">Loading...</span>
            </div>
            <div class="text-muted small">
                {{ $t("additional:modules.tools.voibosTools.elevation.loading") }}
            </div>
        </div>

        <!-- Error Message -->
        <div
            v-if="errorMessage && !isLoading"
            class="alert alert-warning d-flex align-items-start mb-3"
            role="alert"
        >
            <i
                class="bi bi-exclamation-triangle-fill me-2 mt-1 fs-5"
                aria-hidden="true"
            />
            <div class="small">
                {{ errorMessage }}
            </div>
        </div>

        <!-- Result Display -->
        <div
            v-if="elevationData && !isLoading"
            class="elevation-result-container"
        >
            <!-- Main Elevation Card -->
            <div class="card shadow-sm mb-3 border-0 bg-light">
                <div class="card-body p-3">
                    <div class="text-uppercase text-muted small fw-bold mb-1">
                        {{ $t("additional:modules.tools.voibosTools.elevation.dtmLabel") }}
                    </div>
                    <div class="d-flex align-items-baseline mb-2">
                        <span class="elevation-value text-primary fw-bold">
                            {{ formatNumber(elevationData.hoeheDTM, 1) }}
                        </span>
                        <span class="ms-2 fs-6 text-muted">
                            {{ elevationData.einheit || "m ü. A." }}
                        </span>
                    </div>

                    <!-- Additional Heights (DSM & Delta H) -->
                    <div class="row g-2 pt-2 border-top">
                        <div class="col-6">
                            <span class="text-muted small d-block">
                                {{ $t("additional:modules.tools.voibosTools.elevation.dsmLabel") }}:
                            </span>
                            <span class="fw-semibold">
                                {{ formatNumber(elevationData.hoeheDSM, 1) }} m
                            </span>
                        </div>
                        <div class="col-6">
                            <span class="text-muted small d-block">
                                {{ $t("additional:modules.tools.voibosTools.elevation.deltaHLabel") }}:
                            </span>
                            <span class="fw-semibold">
                                {{ formatNumber(elevationData.deltaH, 1) }} m
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Coordinates Card -->
            <div class="card shadow-sm mb-3 border-0">
                <div class="card-body p-3">
                    <h6 class="card-title d-flex align-items-center mb-2 fs-6">
                        <i
                            class="bi bi-geo-alt me-2 text-primary"
                            aria-hidden="true"
                        />
                        {{ $t("additional:modules.tools.voibosTools.elevation.coordinatesTitle") }}
                    </h6>
                    <div class="row g-2 small">
                        <div class="col-6">
                            <span class="text-muted d-block">
                                {{ $t("additional:modules.tools.voibosTools.elevation.easting") }}:
                            </span>
                            <code class="fw-bold">
                                {{ formatNumber(clickedCoordVoibos?.[0] || elevationData.abfragekoordinaten?.rechtswert, 2) }}
                            </code>
                        </div>
                        <div class="col-6">
                            <span class="text-muted d-block">
                                {{ $t("additional:modules.tools.voibosTools.elevation.northing") }}:
                            </span>
                            <code class="fw-bold">
                                {{ formatNumber(clickedCoordVoibos?.[1] || elevationData.abfragekoordinaten?.hochwert, 2) }}
                            </code>
                        </div>
                        <div class="col-12 mt-1">
                            <span class="text-muted">
                                {{ $t("additional:modules.tools.voibosTools.elevation.crs") }}:
                            </span>
                            <span class="badge bg-secondary ms-1">
                                {{ targetCrs }}
                            </span>
                        </div>
                    </div>

                    <!-- Copy coordinates button -->
                    <div class="mt-2 pt-2 border-top">
                        <button
                            type="button"
                            class="btn btn-sm btn-outline-primary w-100"
                            @click="copyCoordinates"
                        >
                            <i
                                class="bi me-1"
                                :class="isCopied ? 'bi-check-lg' : 'bi-clipboard'"
                                aria-hidden="true"
                            />
                            {{ isCopied
                                ? $t("additional:modules.tools.voibosTools.elevation.copied")
                                : $t("additional:modules.tools.voibosTools.elevation.copyCoords")
                            }}
                        </button>
                    </div>
                </div>
            </div>

            <!-- Dataset Metadata -->
            <div
                v-if="elevationData.datengrundlage"
                class="card shadow-sm mb-3 border-0 bg-transparent"
            >
                <div class="card-body p-2 px-3 small text-muted">
                    <div class="d-flex justify-content-between mb-1">
                        <span>{{ $t("additional:modules.tools.voibosTools.elevation.datasource") }}:</span>
                        <span class="fw-semibold text-dark text-end">
                            {{ elevationData.datengrundlage }}
                        </span>
                    </div>
                    <div
                        v-if="elevationData.flugjahr && elevationData.flugjahr !== 'n/a'"
                        class="d-flex justify-content-between"
                    >
                        <span>{{ $t("additional:modules.tools.voibosTools.elevation.flightYear") }}:</span>
                        <span class="fw-semibold text-dark">
                            {{ elevationData.flugjahr }}
                        </span>
                    </div>
                </div>
            </div>

            <!-- Reset Button -->
            <div class="d-grid mt-2">
                <button
                    type="button"
                    class="btn btn-outline-secondary btn-sm"
                    @click="reset"
                >
                    <i
                        class="bi bi-arrow-counterclockwise me-1"
                        aria-hidden="true"
                    />
                    {{ $t("additional:modules.tools.voibosTools.elevation.reset") }}
                </button>
            </div>
        </div>

        <!-- Initial Placeholder State when no click made yet -->
        <div
            v-if="!elevationData && !isLoading && !errorMessage"
            class="text-center text-muted p-4 my-3 border rounded bg-light"
        >
            <i
                class="bi bi-geo-alt fs-1 text-secondary d-block mb-2"
                aria-hidden="true"
            />
            <p class="mb-0 small">
                {{ $t("additional:modules.tools.voibosTools.elevation.instruction") }}
            </p>
        </div>
    </div>
</template>

<style lang="scss" scoped>
.voibos-hoehenservice {
    width: 100%;
}

.elevation-value {
    font-size: 2rem;
    line-height: 1;
}

.card {
    border-radius: 8px;
}
</style>
