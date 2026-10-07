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
 * SonnengangService - Sonnenstandsanalyse für Datum und Uhrzeit.
 * @module addons/voibosTools/components/SonnengangService
 */
export default {
    name: "SonnengangService",
    data () {
        const now = new Date(),
            year = now.getFullYear(),
            month = String(now.getMonth() + 1).padStart(2, "0"),
            day = String(now.getDate()).padStart(2, "0"),
            hours = String(now.getHours()).padStart(2, "0"),
            minutes = String(now.getMinutes()).padStart(2, "0");

        return {
            map: null,
            vectorSource: null,
            vectorLayer: null,
            mapCheckInterval: null,

            // Inputs (defaults: today & current time)
            selectedDate: `${year}-${month}-${day}`,
            selectedTime: `${hours}:${minutes}`,
            isPickingLocation: true,

            // Query state
            isLoading: false,
            sunResult: null,
            clickedCoordMap: null,
            clickedCoordVoibos: null,
            targetCrs: "EPSG:31287",
            errorMessage: null
        };
    },
    computed: {
        /**
         * Checks if Daylight Saving Time (MESZ) applies for the selected date.
         * @returns {Boolean}
         */
        isDaylightSavingTime () {
            if (!this.selectedDate) {
                return true;
            }
            const dateObj = new Date(this.selectedDate),
                janOffset = new Date(dateObj.getFullYear(), 0, 1).getTimezoneOffset(),
                julOffset = new Date(dateObj.getFullYear(), 6, 1).getTimezoneOffset();

            return dateObj.getTimezoneOffset() < Math.max(janOffset, julOffset);
        }
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
                    id: "voibos-sonnengang-layer",
                    name: "Voibos Sonnengang Marker Layer",
                    alwaysOnTop: true,
                    zIndex: 9999
                });
            }

            if (this.map && !this.map.getLayers().getArray().includes(this.vectorLayer)) {
                this.map.addLayer(this.vectorLayer);
            }

            this.onMapClick = this.handleMapClick.bind(this);
            this.map.on("singleclick", this.onMapClick);
        },

        /**
         * Cleans up map listener and vector layer.
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
         * Activates or toggles location picking mode.
         */
        activateLocationPicking () {
            this.isPickingLocation = true;
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

            const transformed = coordinateService.transform(coord, "EPSG:3857", this.targetCrs);

            if (!transformed) {
                this.errorMessage = this.$t("additional:modules.tools.voibosTools.sun.errorGeneric");
                return;
            }

            this.clickedCoordVoibos = transformed;
            await this.querySunService();
        },

        /**
         * Renders sun marker at given coordinate.
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
         * Marker style with sun / gold accent.
         * @returns {Array<module:ol/style/Style>}
         */
        createMarkerStyle () {
            return [
                new Style({
                    image: new Circle({
                        radius: 11,
                        fill: new Fill({color: "#FF9800"}),
                        stroke: new Stroke({color: "#FFFFFF", width: 3})
                    })
                }),
                new Style({
                    image: new Circle({
                        radius: 5,
                        fill: new Fill({color: "#FFF3E0"})
                    })
                })
            ];
        },

        /**
         * Queries Voibos sun position service for the current point and inputs.
         */
        async querySunService () {
            if (!this.clickedCoordVoibos) {
                return;
            }

            this.isLoading = true;
            this.errorMessage = null;

            try {
                const response = await voibosApi.fetchSunPosition({
                    coordinate: this.clickedCoordVoibos,
                    date: this.selectedDate,
                    time: this.selectedTime,
                    crs: this.targetCrs
                });

                if (response.abfragestatus && response.abfragestatus !== "erfolgreich") {
                    this.errorMessage = response.abfragestatus;
                }

                this.sunResult = voibosApi.parseSunData(
                    response,
                    this.selectedTime,
                    this.isDaylightSavingTime
                );
            }
            catch (error) {
                this.errorMessage = error.message || this.$t("additional:modules.tools.voibosTools.sun.errorGeneric");
                this.sunResult = null;
            }
            finally {
                this.isLoading = false;
            }
        },

        /**
         * Handles change in date or time; recalculates if coordinates are already set.
         */
        async onDateTimeChange () {
            if (this.clickedCoordVoibos) {
                await this.querySunService();
            }
        },

        /**
         * Converts azimuth degrees into cardinal direction string.
         * @param {Number} azimuth
         * @returns {String}
         */
        getCompassDirection (azimuth) {
            if (typeof azimuth !== "number" || isNaN(azimuth)) {
                return "";
            }
            const directions = ["N", "NNO", "NO", "ONO", "O", "OSO", "SO", "SSO", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"],
                index = Math.round(azimuth / 22.5) % 16;

            return directions[index];
        },

        /**
         * Resets current query and marker.
         */
        reset () {
            this.sunResult = null;
            this.clickedCoordMap = null;
            this.clickedCoordVoibos = null;
            this.errorMessage = null;

            if (this.vectorSource) {
                this.vectorSource.clear();
            }
        },

        /**
         * Formats a number with locale digits.
         * @param {Number|String} val
         * @param {Number} [decimals=1]
         * @returns {String}
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
    <div id="voibos-sonnengang" class="voibos-sonnengang p-1">
        <!-- Date and Time Picker Card -->
        <div class="card shadow-sm mb-3 border-0 bg-light">
            <div class="card-body p-3">
                <div class="row g-2 mb-2">
                    <!-- Date input -->
                    <div class="col-7">
                        <label for="sonnengang-date" class="form-label small text-muted mb-1">
                            <i class="bi bi-calendar3 me-1" aria-hidden="true" />
                            {{ $t("additional:modules.tools.voibosTools.sun.dateLabel") }}
                        </label>
                        <input
                            id="sonnengang-date"
                            v-model="selectedDate"
                            type="date"
                            class="form-control form-control-sm"
                            @change="onDateTimeChange"
                        >
                    </div>

                    <!-- Time input -->
                    <div class="col-5">
                        <label for="sonnengang-time" class="form-label small text-muted mb-1">
                            <i class="bi bi-clock me-1" aria-hidden="true" />
                            {{ $t("additional:modules.tools.voibosTools.sun.timeLabel") }}
                        </label>
                        <input
                            id="sonnengang-time"
                            v-model="selectedTime"
                            type="time"
                            class="form-control form-control-sm"
                            @change="onDateTimeChange"
                        >
                    </div>
                </div>

                <!-- Pick location button -->
                <div class="d-flex gap-2 mt-3 pt-2 border-top">
                    <button
                        type="button"
                        class="btn btn-sm w-100"
                        :class="isPickingLocation ? 'btn-primary' : 'btn-outline-primary'"
                        @click="activateLocationPicking"
                    >
                        <i class="bi bi-geo-alt-fill me-1" aria-hidden="true" />
                        {{ isPickingLocation && !clickedCoordVoibos
                            ? $t("additional:modules.tools.voibosTools.sun.locationActive")
                            : $t("additional:modules.tools.voibosTools.sun.pickLocationBtn")
                        }}
                    </button>

                    <!-- Recalculate button (if location already set) -->
                    <button
                        v-if="clickedCoordVoibos"
                        type="button"
                        class="btn btn-sm btn-outline-secondary"
                        :disabled="isLoading"
                        :title="$t('additional:modules.tools.voibosTools.sun.recalculateBtn')"
                        @click="querySunService"
                    >
                        <i class="bi bi-arrow-clockwise" aria-hidden="true" />
                    </button>
                </div>
            </div>
        </div>

        <!-- Hint Banner -->
        <div
            v-if="!clickedCoordVoibos"
            class="alert alert-info d-flex align-items-center mb-3 py-2 px-3 small"
            role="status"
        >
            <i class="bi bi-cursor-fill me-2 fs-5" aria-hidden="true" />
            <div>{{ $t("additional:modules.tools.voibosTools.sun.activeHint") }}</div>
        </div>

        <!-- Loading Spinner -->
        <div
            v-if="isLoading"
            class="d-flex flex-column align-items-center justify-content-center p-4 my-2"
        >
            <div class="spinner-border text-primary mb-2" role="status">
                <span class="visually-hidden">Loading...</span>
            </div>
            <div class="text-muted small">
                {{ $t("additional:modules.tools.voibosTools.sun.loading") }}
            </div>
        </div>

        <!-- Error Message -->
        <div
            v-if="errorMessage && !isLoading"
            class="alert alert-warning d-flex align-items-start mb-3"
            role="alert"
        >
            <i class="bi bi-exclamation-triangle-fill me-2 mt-1 fs-5" aria-hidden="true" />
            <div class="small">
                {{ errorMessage }}
            </div>
        </div>

        <!-- Result Display -->
        <div v-if="sunResult && !isLoading" class="sun-result-container">
            <!-- Sun Position Card (Azimuth & Elevation) -->
            <div class="card shadow-sm mb-3 border-0 bg-light">
                <div class="card-body p-3">
                    <div class="row g-2 text-center">
                        <!-- Azimuth -->
                        <div class="col-6 border-end">
                            <span class="text-muted small d-block">
                                {{ $t("additional:modules.tools.voibosTools.sun.azimuthLabel") }}
                            </span>
                            <span class="display-6 fw-bold text-dark d-block">
                                {{ formatNumber(sunResult.currentPosition?.azimuth, 0) }}°
                            </span>
                            <span class="badge bg-secondary">
                                {{ getCompassDirection(sunResult.currentPosition?.azimuth) }}
                            </span>
                        </div>

                        <!-- Elevation -->
                        <div class="col-6">
                            <span class="text-muted small d-block">
                                {{ $t("additional:modules.tools.voibosTools.sun.elevationLabel") }}
                            </span>
                            <span
                                class="display-6 fw-bold d-block"
                                :class="sunResult.currentPosition?.isAboveHorizon ? 'text-primary' : 'text-muted'"
                            >
                                {{ formatNumber(sunResult.currentPosition?.elevation, 1) }}°
                            </span>
                            <span
                                class="badge"
                                :class="sunResult.currentPosition?.isAboveHorizon ? 'bg-success' : 'bg-dark'"
                            >
                                {{ sunResult.currentPosition?.isAboveHorizon ? 'Über Horizont' : 'Unter Horizont' }}
                            </span>
                        </div>
                    </div>

                    <!-- Direct Sun / Shading Status Banner -->
                    <div class="mt-3 pt-2 border-top">
                        <div
                            v-if="sunResult.currentPosition?.isDirectSun"
                            class="alert alert-success d-flex align-items-center mb-0 py-1 px-2 small"
                        >
                            <i class="bi bi-sun-fill text-warning fs-5 me-2" aria-hidden="true" />
                            <strong>{{ $t("additional:modules.tools.voibosTools.sun.directSun") }}</strong>
                        </div>
                        <div
                            v-else-if="sunResult.currentPosition?.isAboveHorizon"
                            class="alert alert-warning d-flex align-items-center mb-0 py-1 px-2 small"
                        >
                            <i class="bi bi-cloud-sun-fill fs-5 me-2" aria-hidden="true" />
                            <div>
                                <span>{{ $t("additional:modules.tools.voibosTools.sun.shaded") }}</span>
                                <small class="d-block text-muted">
                                    {{ $t("additional:modules.tools.voibosTools.sun.surfaceHorizon") }}:
                                    {{ formatNumber(sunResult.currentPosition?.surfaceHorizon, 1) }}°
                                </small>
                            </div>
                        </div>
                        <div
                            v-else
                            class="alert alert-secondary d-flex align-items-center mb-0 py-1 px-2 small"
                        >
                            <i class="bi bi-moon-stars-fill fs-5 me-2" aria-hidden="true" />
                            <span>{{ $t("additional:modules.tools.voibosTools.sun.belowHorizon") }}</span>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Sunrise & Sunset Card -->
            <div class="card shadow-sm mb-3 border-0">
                <div class="card-body p-3">
                    <h6 class="card-title d-flex align-items-center mb-2 fs-6">
                        <i class="bi bi-brightness-alt-high-fill me-2 text-warning" aria-hidden="true" />
                        Tagesverlauf ({{ sunResult.timeZoneSuffix }})
                    </h6>

                    <div class="row g-2 text-center pt-1">
                        <!-- Sunrise -->
                        <div class="col-4">
                            <span class="text-muted small d-block">
                                <i class="bi bi-sunrise text-warning me-1" aria-hidden="true" />
                                {{ $t("additional:modules.tools.voibosTools.sun.sunriseLabel") }}
                            </span>
                            <span class="fw-bold fs-6">
                                {{ sunResult.sunrise?.time || "-" }}
                            </span>
                            <small class="d-block text-muted">
                                {{ sunResult.sunrise ? sunResult.sunrise.azimuth + '° (' + getCompassDirection(sunResult.sunrise.azimuth) + ')' : '' }}
                            </small>
                        </div>

                        <!-- Solar Noon -->
                        <div class="col-4 border-start border-end">
                            <span class="text-muted small d-block">
                                <i class="bi bi-sun text-warning me-1" aria-hidden="true" />
                                Höchststand
                            </span>
                            <span class="fw-bold fs-6">
                                {{ sunResult.solarNoon?.time || "-" }}
                            </span>
                            <small class="d-block text-muted">
                                {{ sunResult.solarNoon ? formatNumber(sunResult.solarNoon.maxElevation, 1) + '°' : '' }}
                            </small>
                        </div>

                        <!-- Sunset -->
                        <div class="col-4">
                            <span class="text-muted small d-block">
                                <i class="bi bi-sunset text-danger me-1" aria-hidden="true" />
                                {{ $t("additional:modules.tools.voibosTools.sun.sunsetLabel") }}
                            </span>
                            <span class="fw-bold fs-6">
                                {{ sunResult.sunset?.time || "-" }}
                            </span>
                            <small class="d-block text-muted">
                                {{ sunResult.sunset ? sunResult.sunset.azimuth + '° (' + getCompassDirection(sunResult.sunset.azimuth) + ')' : '' }}
                            </small>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Coordinates Info -->
            <div class="card shadow-sm mb-3 border-0 bg-transparent">
                <div class="card-body p-2 px-3 small text-muted">
                    <div class="d-flex justify-content-between mb-1">
                        <span>{{ $t("additional:modules.tools.voibosTools.sun.easting") }}:</span>
                        <code class="fw-semibold text-dark">
                            {{ formatNumber(clickedCoordVoibos?.[0], 2) }} m
                        </code>
                    </div>
                    <div class="d-flex justify-content-between mb-1">
                        <span>{{ $t("additional:modules.tools.voibosTools.sun.northing") }}:</span>
                        <code class="fw-semibold text-dark">
                            {{ formatNumber(clickedCoordVoibos?.[1], 2) }} m
                        </code>
                    </div>
                    <div v-if="sunResult.altitudeInfo" class="d-flex justify-content-between">
                        <span>Standorthöhe:</span>
                        <span class="fw-semibold text-dark">{{ sunResult.altitudeInfo }} m</span>
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
                    <i class="bi bi-arrow-counterclockwise me-1" aria-hidden="true" />
                    {{ $t("additional:modules.tools.voibosTools.sun.reset") }}
                </button>
            </div>
        </div>

        <!-- Initial Placeholder -->
        <div
            v-if="!sunResult && !isLoading && !errorMessage"
            class="text-center text-muted p-4 my-3 border rounded bg-light"
        >
            <i class="bi bi-sun fs-1 text-warning d-block mb-2" aria-hidden="true" />
            <p class="mb-0 small">
                {{ $t("additional:modules.tools.voibosTools.sun.instruction") }}
            </p>
        </div>
    </div>
</template>

<style lang="scss" scoped>
.voibos-sonnengang {
    width: 100%;
}

.card {
    border-radius: 8px;
}
</style>
