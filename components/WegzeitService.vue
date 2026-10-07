<script>
import VectorLayer from "ol/layer/Vector.js";
import VectorSource from "ol/source/Vector.js";
import Feature from "ol/Feature.js";
import Point from "ol/geom/Point.js";
import LineString from "ol/geom/LineString.js";
import {Style, Circle, Fill, Stroke, Text} from "ol/style.js";
import mapCollection from "@core/maps/js/mapCollection.js";
import voibosApi from "../services/voibosApi.js";
import coordinateService from "../services/coordinateService.js";

/**
 * WegzeitService component - Multi-Punkt-Wegzeitberechnung mit Masterportal-Karteninteraktion.
 * @module addons/voibosTools/components/WegzeitService
 */
export default {
    name: "WegzeitService",
    data () {
        return {
            waypoints: [],
            selectedMethod: "DIN33466",
            selectedPaceFactor: 1.0,
            autoCalculate: true,
            isLoading: false,
            errorMessage: null,
            travelTimeData: null,
            targetCrs: "EPSG:31287",
            map: null,
            vectorLayer: null,
            vectorSource: null,
            mapCheckInterval: null
        };
    },
    computed: {
        /**
         * Returns true if at least two waypoints are captured to calculate a route.
         * @returns {Boolean} Has enough points.
         */
        hasEnoughPoints () {
            return this.waypoints.length >= 2;
        }
    },
    watch: {
        selectedMethod () {
            if (this.hasEnoughPoints && this.autoCalculate) {
                this.calculateTravelTime();
            }
        },
        selectedPaceFactor () {
            if (this.hasEnoughPoints && this.autoCalculate) {
                this.calculateTravelTime();
            }
        }
    },
    mounted () {
        this.initMapAndLayer();
    },
    activated () {
        if (!this.map) {
            this.initMapAndLayer();
        }
        else {
            this.map.on("singleclick", this.handleMapClick);
            const layers = this.map.getLayers().getArray();

            if (this.vectorLayer && !layers.includes(this.vectorLayer)) {
                this.map.addLayer(this.vectorLayer);
            }
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
         * Initializes OpenLayers map, click listener, and dedicated vector layer.
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
         * Sets up vector layer and click listener on the active map.
         */
        setupLayerAndListener () {
            if (!this.vectorSource) {
                this.vectorSource = new VectorSource();
            }

            if (!this.vectorLayer) {
                this.vectorLayer = new VectorLayer({
                    source: this.vectorSource,
                    id: "voibos-wegzeit-vector-layer",
                    name: "Voibos Wegzeit Layer",
                    alwaysOnTop: true,
                    zIndex: 9999
                });
            }

            if (this.map) {
                const layers = this.map.getLayers().getArray();

                if (!layers.includes(this.vectorLayer)) {
                    this.map.addLayer(this.vectorLayer);
                }
                this.map.on("singleclick", this.handleMapClick);
            }
        },

        /**
         * Handles map click to add a new waypoint.
         * @param {Object} event OpenLayers MapBrowserEvent.
         */
        async handleMapClick (event) {
            if (!event?.coordinate) {
                return;
            }

            this.errorMessage = null;
            const coordMap = event.coordinate,
                  coordVoibos = coordinateService.transform(coordMap, "EPSG:3857", this.targetCrs);

            if (!coordinateService.isValidCoordinate(coordVoibos)) {
                this.errorMessage = this.$t("additional:modules.tools.voibosTools.routing.errorGeneric");
                return;
            }

            // Plausibility check for Austrian extent (MGI Austria Lambert)
            const [x, y] = coordVoibos;

            if (x < 100000 || x > 800000 || y < 150000 || y > 700000) {
                this.errorMessage = this.$t("additional:modules.tools.voibosTools.routing.notInAustria");
                return;
            }

            this.waypoints.push({
                id: Date.now() + Math.random(),
                coordMap,
                coordVoibos
            });

            this.updateMapFeatures();

            if (this.hasEnoughPoints && this.autoCalculate) {
                await this.calculateTravelTime();
            }
        },

        /**
         * Re-renders all waypoint marker features and connecting dashed line on the map.
         */
        updateMapFeatures () {
            if (!this.vectorSource) {
                return;
            }

            this.vectorSource.clear();

            if (this.waypoints.length === 0) {
                return;
            }

            // 1. Draw dashed connecting line if at least 2 points
            if (this.waypoints.length >= 2) {
                const lineCoords = this.waypoints.map(w => w.coordMap),
                      lineFeature = new Feature({
                          geometry: new LineString(lineCoords)
                      });

                lineFeature.setStyle(new Style({
                    stroke: new Stroke({
                        color: "#0d6efd",
                        width: 3,
                        lineDash: [8, 6]
                    })
                }));

                this.vectorSource.addFeature(lineFeature);
            }

            // 2. Draw numbered marker badges for each waypoint
            this.waypoints.forEach((wp, index) => {
                const markerFeature = new Feature({
                    geometry: new Point(wp.coordMap)
                });

                markerFeature.setStyle(this.createWaypointMarkerStyle(index, this.waypoints.length));
                this.vectorSource.addFeature(markerFeature);
            });
        },

        /**
         * Creates OpenLayers vector style for a numbered waypoint marker badge.
         * @param {Number} index Zero-based index of the waypoint.
         * @param {Number} total Total number of waypoints.
         * @returns {Array<Style>} OpenLayers styles array.
         */
        createWaypointMarkerStyle (index, total) {
            const isStart = index === 0,
                  isEnd = index === total - 1 && total > 1;
            let fillColor = "#fd7e14"; // intermediate: orange

            if (isStart) {
                fillColor = "#198754"; // start: green
            }
            else if (isEnd) {
                fillColor = "#dc3545"; // destination: red
            }

            return [
                new Style({
                    image: new Circle({
                        radius: 13,
                        fill: new Fill({color: fillColor}),
                        stroke: new Stroke({color: "#ffffff", width: 2.5})
                    }),
                    text: new Text({
                        text: String(index + 1),
                        font: "bold 12px sans-serif",
                        fill: new Fill({color: "#ffffff"}),
                        textAlign: "center",
                        textBaseline: "middle"
                    }),
                    zIndex: 100
                })
            ];
        },

        /**
         * Removes a waypoint at the specified index.
         * @param {Number} index Index of point to remove.
         */
        async removeWaypoint (index) {
            this.waypoints.splice(index, 1);
            this.updateMapFeatures();

            if (this.hasEnoughPoints && this.autoCalculate) {
                await this.calculateTravelTime();
            }
            else if (!this.hasEnoughPoints) {
                this.travelTimeData = null;
            }
        },

        /**
         * Moves a waypoint up in sequence.
         * @param {Number} index Current index.
         */
        async moveWaypointUp (index) {
            if (index <= 0) {
                return;
            }
            const item = this.waypoints.splice(index, 1)[0];

            this.waypoints.splice(index - 1, 0, item);
            this.updateMapFeatures();

            if (this.hasEnoughPoints && this.autoCalculate) {
                await this.calculateTravelTime();
            }
        },

        /**
         * Moves a waypoint down in sequence.
         * @param {Number} index Current index.
         */
        async moveWaypointDown (index) {
            if (index >= this.waypoints.length - 1) {
                return;
            }
            const item = this.waypoints.splice(index, 1)[0];

            this.waypoints.splice(index + 1, 0, item);
            this.updateMapFeatures();

            if (this.hasEnoughPoints && this.autoCalculate) {
                await this.calculateTravelTime();
            }
        },

        /**
         * Resets all waypoints, results, and map features.
         */
        reset () {
            this.waypoints = [];
            this.travelTimeData = null;
            this.errorMessage = null;
            this.updateMapFeatures();
        },

        /**
         * Queries Voibos wegzeit service for all waypoints.
         */
        async calculateTravelTime () {
            if (!this.hasEnoughPoints) {
                this.errorMessage = this.$t("additional:modules.tools.voibosTools.routing.errorFewPoints");
                return;
            }

            this.isLoading = true;
            this.errorMessage = null;

            try {
                const coordinates = this.waypoints.map(w => w.coordVoibos),
                      response = await voibosApi.fetchTravelTime({
                          coordinates,
                          method: this.selectedMethod,
                          crs: this.targetCrs
                      });

                this.travelTimeData = voibosApi.parseTravelTimeData(response, this.selectedPaceFactor);

                if (!this.travelTimeData) {
                    this.errorMessage = this.$t("additional:modules.tools.voibosTools.routing.errorGeneric");
                }
            }
            catch (error) {
                this.errorMessage = error?.message || this.$t("additional:modules.tools.voibosTools.routing.errorGeneric");
                this.travelTimeData = null;
            }
            finally {
                this.isLoading = false;
            }
        },

        /**
         * Formats duration in minutes to hours and minutes string (e.g. "1:25 h" or "45 min").
         * @param {Number} minutes Total duration in minutes.
         * @returns {String} Formatted duration.
         */
        formatDuration (minutes) {
            if (minutes === undefined || minutes === null || isNaN(minutes)) {
                return "-";
            }
            if (minutes <= 0) {
                return "0 min";
            }
            if (minutes < 60) {
                return `${minutes} min`;
            }
            const hours = Math.floor(minutes / 60),
                  mins = minutes % 60;

            return `${hours}:${String(mins).padStart(2, "0")} h`;
        },

        /**
         * Formats distance in meters to readable km or m string.
         * @param {Number} meters Distance in meters.
         * @returns {String} Formatted distance.
         */
        formatDistance (meters) {
            if (meters === undefined || meters === null || isNaN(meters)) {
                return "-";
            }
            if (meters >= 1000) {
                return `${(meters / 1000).toFixed(2)} km`;
            }
            return `${Math.round(meters)} m`;
        },

        /**
         * Formats numeric coordinate pair with specified precision.
         * @param {Array<Number>} coord [x, y] coordinate.
         * @returns {String} Formatted string.
         */
        formatCoordinate (coord) {
            if (!Array.isArray(coord) || coord.length < 2) {
                return "";
            }
            return `${Math.round(coord[0])}, ${Math.round(coord[1])}`;
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
                this.map.un("singleclick", this.handleMapClick);
                if (this.vectorSource) {
                    this.vectorSource.clear();
                }
                if (this.vectorLayer) {
                    this.map.removeLayer(this.vectorLayer);
                }
            }
        }
    }
};
</script>

<template>
    <div
        id="voibos-wegzeitservice"
        class="voibos-wegzeitservice p-1"
    >
        <!-- Header & Description -->
        <div class="mb-3">
            <h5 class="fw-bold mb-1">
                <i
                    class="bi bi-stopwatch text-primary me-2"
                    aria-hidden="true"
                />
                {{ $t('additional:modules.tools.voibosTools.routing.title') }}
            </h5>
            <p class="text-muted small mb-2">
                {{ $t('additional:modules.tools.voibosTools.routing.description') }}
            </p>
            <div
                class="alert alert-primary py-2 px-3 small d-flex align-items-center mb-0"
                role="alert"
            >
                <i
                    class="bi bi-cursor-fill me-2 flex-shrink-0"
                    aria-hidden="true"
                />
                <span>{{ $t('additional:modules.tools.voibosTools.routing.instruction') }}</span>
            </div>
        </div>

        <!-- Error Message -->
        <div
            v-if="errorMessage"
            class="alert alert-danger py-2 px-3 small d-flex align-items-center mb-3"
            role="alert"
        >
            <i
                class="bi bi-exclamation-triangle-fill me-2 flex-shrink-0"
                aria-hidden="true"
            />
            <span>{{ errorMessage }}</span>
        </div>

        <!-- Profile & Settings Controls -->
        <div class="card shadow-sm mb-3 border-0 bg-light">
            <div class="card-body p-3">
                <div class="row g-2">
                    <!-- Method Selection -->
                    <div class="col-12 col-sm-7">
                        <label
                            for="wegzeit-method-select"
                            class="form-label small fw-bold mb-1"
                        >
                            <i
                                class="bi bi-sliders me-1"
                                aria-hidden="true"
                            />
                            {{ $t('additional:modules.tools.voibosTools.routing.methodLabel') }}
                        </label>
                        <select
                            id="wegzeit-method-select"
                            v-model="selectedMethod"
                            class="form-select form-select-sm"
                        >
                            <option value="DIN33466">
                                {{ $t('additional:modules.tools.voibosTools.routing.methodDin') }}
                            </option>
                            <option value="SAC">
                                {{ $t('additional:modules.tools.voibosTools.routing.methodSac') }}
                            </option>
                            <option value="VIIA">
                                {{ $t('additional:modules.tools.voibosTools.routing.methodViia') }}
                            </option>
                        </select>
                    </div>

                    <!-- Pace Factor Selection -->
                    <div class="col-12 col-sm-5">
                        <label
                            for="wegzeit-pace-select"
                            class="form-label small fw-bold mb-1"
                        >
                            <i
                                class="bi bi-speedometer2 me-1"
                                aria-hidden="true"
                            />
                            {{ $t('additional:modules.tools.voibosTools.routing.paceLabel') }}
                        </label>
                        <select
                            id="wegzeit-pace-select"
                            v-model.number="selectedPaceFactor"
                            class="form-select form-select-sm"
                        >
                            <option :value="1.0">
                                {{ $t('additional:modules.tools.voibosTools.routing.paceNormal') }}
                            </option>
                            <option :value="0.8">
                                {{ $t('additional:modules.tools.voibosTools.routing.paceLeisurely') }}
                            </option>
                            <option :value="1.2">
                                {{ $t('additional:modules.tools.voibosTools.routing.paceFast') }}
                            </option>
                        </select>
                    </div>
                </div>
            </div>
        </div>

        <!-- Waypoint Manager Card -->
        <div class="card shadow-sm mb-3 border-0">
            <div class="card-header bg-white py-2 px-3 d-flex justify-content-between align-items-center">
                <span class="fw-bold small">
                    <i
                        class="bi bi-geo-alt-fill text-danger me-1"
                        aria-hidden="true"
                    />
                    {{ $t('additional:modules.tools.voibosTools.routing.pointListTitle') }}
                    <span class="badge bg-secondary ms-1">{{ waypoints.length }}</span>
                </span>
                <button
                    v-if="waypoints.length > 0"
                    type="button"
                    class="btn btn-outline-danger btn-sm py-0 px-2 small"
                    :title="$t('additional:modules.tools.voibosTools.routing.reset')"
                    @click="reset"
                >
                    <i
                        class="bi bi-trash me-1"
                        aria-hidden="true"
                    />
                    {{ $t('additional:modules.tools.voibosTools.routing.reset') }}
                </button>
            </div>

            <!-- Empty State -->
            <div
                v-if="waypoints.length === 0"
                class="card-body p-3 text-center text-muted small"
            >
                <i
                    class="bi bi-pin-map display-6 d-block mb-2 text-secondary opacity-50"
                    aria-hidden="true"
                />
                {{ $t('additional:modules.tools.voibosTools.routing.emptyState') }}
            </div>

            <!-- Waypoint List -->
            <ul
                v-else
                class="list-group list-group-flush"
            >
                <li
                    v-for="(wp, index) in waypoints"
                    :key="wp.id"
                    class="list-group-item d-flex align-items-center justify-content-between py-2 px-3"
                >
                    <!-- Left: Number Badge & Point Info -->
                    <div class="d-flex align-items-center gap-2 overflow-hidden me-2">
                        <!-- Marker Badge -->
                        <span
                            class="badge rounded-circle d-flex align-items-center justify-content-center text-white flex-shrink-0 waypoint-badge"
                            :class="{
                                'bg-success': index === 0,
                                'bg-danger': index === waypoints.length - 1 && waypoints.length > 1,
                                'bg-warning text-dark': index > 0 && index < waypoints.length - 1
                            }"
                        >
                            {{ index + 1 }}
                        </span>

                        <!-- Label & Coordinates -->
                        <div class="text-truncate">
                            <span class="fw-bold small d-block text-truncate">
                                <span v-if="index === 0">
                                    {{ $t('additional:modules.tools.voibosTools.routing.pointStart') }}
                                </span>
                                <span v-else-if="index === waypoints.length - 1 && waypoints.length > 1">
                                    {{ $t('additional:modules.tools.voibosTools.routing.pointEnd') }}
                                </span>
                                <span v-else>
                                    {{ $t('additional:modules.tools.voibosTools.routing.pointVia', {number: index + 1}) }}
                                </span>
                            </span>
                            <span class="text-muted text-truncate font-monospace extra-small">
                                {{ formatCoordinate(wp.coordVoibos) }}
                            </span>
                        </div>
                    </div>

                    <!-- Right: Move & Delete Actions -->
                    <div class="btn-group btn-group-sm flex-shrink-0">
                        <button
                            type="button"
                            class="btn btn-outline-secondary"
                            :disabled="index === 0"
                            :title="$t('additional:modules.tools.voibosTools.routing.moveUp')"
                            :aria-label="$t('additional:modules.tools.voibosTools.routing.moveUp')"
                            @click="moveWaypointUp(index)"
                        >
                            <i
                                class="bi bi-arrow-up"
                                aria-hidden="true"
                            />
                        </button>
                        <button
                            type="button"
                            class="btn btn-outline-secondary"
                            :disabled="index === waypoints.length - 1"
                            :title="$t('additional:modules.tools.voibosTools.routing.moveDown')"
                            :aria-label="$t('additional:modules.tools.voibosTools.routing.moveDown')"
                            @click="moveWaypointDown(index)"
                        >
                            <i
                                class="bi bi-arrow-down"
                                aria-hidden="true"
                            />
                        </button>
                        <button
                            type="button"
                            class="btn btn-outline-danger"
                            :title="$t('additional:modules.tools.voibosTools.routing.deletePoint')"
                            :aria-label="$t('additional:modules.tools.voibosTools.routing.deletePoint')"
                            @click="removeWaypoint(index)"
                        >
                            <i
                                class="bi bi-x-lg"
                                aria-hidden="true"
                            />
                        </button>
                    </div>
                </li>
            </ul>

            <!-- Calculate Button Footer -->
            <div
                v-if="waypoints.length > 0"
                class="card-footer bg-white p-2"
            >
                <button
                    type="button"
                    class="btn btn-primary btn-sm w-100 d-flex align-items-center justify-content-center"
                    :disabled="!hasEnoughPoints || isLoading"
                    @click="calculateTravelTime"
                >
                    <span
                        v-if="isLoading"
                        class="spinner-border spinner-border-sm me-2"
                        role="status"
                        aria-hidden="true"
                    />
                    <i
                        v-else
                        class="bi bi-calculator me-2"
                        aria-hidden="true"
                    />
                    <span>
                        {{ isLoading
                            ? $t('additional:modules.tools.voibosTools.routing.calculating')
                            : $t('additional:modules.tools.voibosTools.routing.calculateBtn')
                        }}
                    </span>
                </button>
            </div>
        </div>

        <!-- Results Display -->
        <div
            v-if="travelTimeData"
            class="results-container"
        >
            <!-- Primary Highlight Stats: Travel Time & Distance -->
            <div class="card shadow-sm mb-3 border-0 bg-primary text-white">
                <div class="card-body p-3">
                    <div class="row text-center g-2">
                        <!-- Walking Time (One Way) -->
                        <div class="col-6 border-end border-white-50">
                            <span class="small opacity-75 d-block text-uppercase">
                                {{ $t('additional:modules.tools.voibosTools.routing.timeOneWay') }}
                            </span>
                            <span class="fs-4 fw-bold d-block">
                                {{ formatDuration(travelTimeData.timeOneWay) }}
                            </span>
                        </div>

                        <!-- Distance (3D) -->
                        <div class="col-6">
                            <span class="small opacity-75 d-block text-uppercase">
                                {{ $t('additional:modules.tools.voibosTools.routing.totalDistance') }}
                            </span>
                            <span class="fs-4 fw-bold d-block">
                                {{ formatDistance(travelTimeData.distance3D || travelTimeData.distance2D) }}
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Elevation & Secondary Stats Card -->
            <div class="card shadow-sm mb-3 border-0 bg-light">
                <div class="card-body p-3">
                    <h6 class="card-title fw-bold fs-6 mb-2">
                        <i
                            class="bi bi-bar-chart-line-fill text-primary me-2"
                            aria-hidden="true"
                        />
                        {{ $t('additional:modules.tools.voibosTools.routing.resultsTitle') }}
                    </h6>

                    <div class="row g-2 text-center pt-1">
                        <!-- Ascent -->
                        <div class="col-6 col-sm-3 border-end">
                            <span class="text-muted small d-block">
                                <i
                                    class="bi bi-arrow-up-right text-success me-1"
                                    aria-hidden="true"
                                />
                                {{ $t('additional:modules.tools.voibosTools.routing.ascent') }}
                            </span>
                            <span class="fw-bold fs-6 text-success d-block">
                                +{{ travelTimeData.ascent }} m
                            </span>
                        </div>

                        <!-- Descent -->
                        <div class="col-6 col-sm-3 border-end">
                            <span class="text-muted small d-block">
                                <i
                                    class="bi bi-arrow-down-right text-danger me-1"
                                    aria-hidden="true"
                                />
                                {{ $t('additional:modules.tools.voibosTools.routing.descent') }}
                            </span>
                            <span class="fw-bold fs-6 text-danger d-block">
                                -{{ travelTimeData.descent }} m
                            </span>
                        </div>

                        <!-- Round Trip Time -->
                        <div class="col-6 col-sm-3 border-end">
                            <span class="text-muted small d-block">
                                <i
                                    class="bi bi-arrow-left-right text-info me-1"
                                    aria-hidden="true"
                                />
                                {{ $t('additional:modules.tools.voibosTools.routing.timeRoundTrip') }}
                            </span>
                            <span class="fw-bold fs-6 text-dark d-block">
                                {{ formatDuration(travelTimeData.timeRoundTrip) }}
                            </span>
                        </div>

                        <!-- Marching Time (with breaks) -->
                        <div class="col-6 col-sm-3">
                            <span class="text-muted small d-block">
                                <i
                                    class="bi bi-cup-hot text-warning me-1"
                                    aria-hidden="true"
                                />
                                {{ $t('additional:modules.tools.voibosTools.routing.marchingTime') }}
                            </span>
                            <span class="fw-bold fs-6 text-dark d-block">
                                {{ formatDuration(travelTimeData.marchingTimeOneWay) }}
                            </span>
                        </div>
                    </div>

                    <!-- Additional Details Row -->
                    <div class="border-top mt-3 pt-2">
                        <div class="row g-2 small text-muted">
                            <div class="col-6">
                                <span>{{ $t('additional:modules.tools.voibosTools.routing.timeReturn') }}:</span>
                                <strong class="text-dark ms-1">
                                    {{ formatDuration(travelTimeData.timeReturn) }}
                                </strong>
                            </div>
                            <div class="col-6">
                                <span>{{ $t('additional:modules.tools.voibosTools.routing.maxSlope') }}:</span>
                                <strong class="text-dark ms-1">
                                    {{ travelTimeData.maxSlope }} ‰
                                </strong>
                            </div>
                            <div class="col-6">
                                <span>{{ $t('additional:modules.tools.voibosTools.routing.minElevation') }}:</span>
                                <strong class="text-dark ms-1">
                                    {{ travelTimeData.minElevation }} m
                                </strong>
                            </div>
                            <div class="col-6">
                                <span>{{ $t('additional:modules.tools.voibosTools.routing.maxElevation') }}:</span>
                                <strong class="text-dark ms-1">
                                    {{ travelTimeData.maxElevation }} m
                                </strong>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Route Segments Accordion/Card (if more than 1 segment) -->
            <div
                v-if="travelTimeData.segments && travelTimeData.segments.length > 1"
                class="card shadow-sm mb-3 border-0"
            >
                <div class="card-header bg-white py-2 px-3">
                    <span class="fw-bold small">
                        <i
                            class="bi bi-signpost-split text-primary me-1"
                            aria-hidden="true"
                        />
                        {{ $t('additional:modules.tools.voibosTools.routing.segmentsTitle') }}
                    </span>
                </div>
                <ul class="list-group list-group-flush small">
                    <li
                        v-for="seg in travelTimeData.segments"
                        :key="`segment-${seg.index}`"
                        class="list-group-item d-flex justify-content-between align-items-center py-2 px-3"
                    >
                        <div>
                            <span class="fw-bold">
                                {{ $t('additional:modules.tools.voibosTools.routing.segmentLabel', {number: seg.index}) }}
                            </span>
                            <span class="text-muted ms-2">
                                ({{ formatDistance(seg.distance) }})
                            </span>
                        </div>
                        <div class="d-flex align-items-center gap-3">
                            <span class="text-success small">
                                +{{ seg.ascent }} m
                            </span>
                            <span class="text-danger small">
                                -{{ seg.descent }} m
                            </span>
                            <span class="badge bg-light text-dark border">
                                {{ formatDuration(seg.timeOneWay) }}
                            </span>
                        </div>
                    </li>
                </ul>
            </div>

            <!-- Metadata Info Footer -->
            <div
                v-if="travelTimeData.dataSource"
                class="text-muted extra-small px-1 mb-2"
            >
                <span>{{ $t('additional:modules.tools.voibosTools.routing.dataSource') }}:</span>
                <span class="ms-1">{{ travelTimeData.dataSource }}</span>
            </div>
        </div>
    </div>
</template>

<style lang="scss" scoped>
.voibos-wegzeitservice {
    width: 100%;
}

.card {
    border-radius: 0.5rem;
}

.waypoint-badge {
    width: 1.5rem;
    height: 1.5rem;
}

.extra-small {
    font-size: 0.75rem;
}

.border-white-50 {
    border-color: rgba(255, 255, 255, 0.3);
}
</style>
