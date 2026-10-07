<script>
import mapCollection from "@core/maps/js/mapCollection.js";
import Draw from "ol/interaction/Draw.js";
import VectorLayer from "ol/layer/Vector.js";
import VectorSource from "ol/source/Vector.js";
import Feature from "ol/Feature.js";
import Point from "ol/geom/Point.js";
import {Style, Stroke, Fill, Circle} from "ol/style.js";

import coordinateService from "../services/coordinateService.js";
import voibosApi from "../services/voibosApi.js";

/**
 * ProfilService component - Höhenprofil entlang einer gezeichneten Linie.
 * @module addons/voibosTools/components/ProfilService
 */
export default {
    name: "ProfilService",
    data () {
        return {
            map: null,
            vectorSource: null,
            vectorLayer: null,
            indicatorSource: null,
            indicatorLayer: null,
            drawInteraction: null,
            mapCheckInterval: null,

            // State
            isDrawingActive: true,
            isLoading: false,
            errorMessage: null,
            targetCrs: "EPSG:31287",
            stepDistance: 10,

            // Geometry & query results
            drawnCoordsMap: [],
            drawnCoordsVoibos: [],
            profileData: null,
            hoveredPoint: null,

            // SVG dimensions
            svgWidth: 500,
            svgHeight: 220
        };
    },
    computed: {

        /**
         * SVG plot padding configuration.
         * @returns {Object} Padding object.
         */
        svgPadding () {
            return {
                top: 15,
                right: 15,
                bottom: 35,
                left: 55
            };
        },

        /**
         * Width of the chart plot area.
         * @returns {Number} Plot width in px.
         */
        plotWidth () {
            return this.svgWidth - this.svgPadding.left - this.svgPadding.right;
        },

        /**
         * Height of the chart plot area.
         * @returns {Number} Plot height in px.
         */
        plotHeight () {
            return this.svgHeight - this.svgPadding.top - this.svgPadding.bottom;
        },

        /**
         * Elevation bounds with padding for chart scaling.
         * @returns {Object} Min and max elevation values.
         */
        elevationBounds () {
            if (!this.profileData || !this.profileData.points || this.profileData.points.length === 0) {
                return {min: 0, max: 100};
            }

            const rawMin = this.profileData.minDtm ?? 0,
                  rawMax = Math.max(this.profileData.maxDtm ?? 100, this.profileData.maxDsm ?? 100),
                  range = rawMax - rawMin || 10,
                  padding = range * 0.08;

            return {
                min: Math.floor(rawMin - padding),
                max: Math.ceil(rawMax + padding)
            };
        },

        /**
         * SVG Path string for the DTM terrain line.
         * @returns {String} SVG path data.
         */
        dtmPath () {
            return this.buildSvgLinePath("dtm");
        },

        /**
         * SVG Path string for the DSM surface line.
         * @returns {String} SVG path data.
         */
        dsmPath () {
            return this.buildSvgLinePath("dsm");
        },

        /**
         * SVG Path string for the DTM filled area below the curve.
         * @returns {String} SVG area path data.
         */
        dtmAreaPath () {
            if (!this.profileData?.points || this.profileData.points.length === 0) {
                return "";
            }
            const line = this.dtmPath,
                  firstX = this.scaleX(0),
                  lastX = this.scaleX(this.profileData.totalDistance),
                  bottomY = this.svgPadding.top + this.plotHeight;

            return `${line} L ${lastX} ${bottomY} L ${firstX} ${bottomY} Z`;
        },

        /**
         * Calculates horizontal grid ticks for distance.
         * @returns {Array<Object>} Array of tick objects.
         */
        distanceTicks () {
            if (!this.profileData || this.profileData.totalDistance <= 0) {
                return [];
            }
            const total = this.profileData.totalDistance,
                  steps = 4,
                  ticks = [];

            for (let i = 0; i <= steps; i++) {
                const dist = (total / steps) * i;

                ticks.push({
                    value: dist,
                    x: this.scaleX(dist),
                    label: dist >= 1000
                        ? `${(dist / 1000).toFixed(1)} km`
                        : `${Math.round(dist)} m`
                });
            }
            return ticks;
        },

        /**
         * Calculates vertical grid ticks for elevation.
         * @returns {Array<Object>} Array of tick objects.
         */
        elevationTicks () {
            const {min, max} = this.elevationBounds,
                  steps = 4,
                  ticks = [],
                  stepVal = (max - min) / steps;

            for (let i = 0; i <= steps; i++) {
                const elev = min + stepVal * i;

                ticks.push({
                    value: elev,
                    y: this.scaleY(elev),
                    label: `${Math.round(elev)} m`
                });
            }
            return ticks;
        }
    },
    mounted () {
        this.initMapAndLayers();
    },
    activated () {
        if (!this.map || !this.vectorLayer) {
            this.initMapAndLayers();
        }
        else if (this.drawInteraction && !this.map.getInteractions().getArray().includes(this.drawInteraction)) {
            this.map.addInteraction(this.drawInteraction);
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
         * Initializes OpenLayers map, vector layers, and draw interaction.
         */
        initMapAndLayers () {
            this.map = mapCollection.getMap("2D");

            if (!this.map) {
                let attempts = 0;

                this.mapCheckInterval = setInterval(() => {
                    attempts++;
                    this.map = mapCollection.getMap("2D");
                    if (this.map) {
                        clearInterval(this.mapCheckInterval);
                        this.setupLayersAndInteraction();
                    }
                    else if (attempts > 25) {
                        clearInterval(this.mapCheckInterval);
                    }
                }, 200);
                return;
            }

            this.setupLayersAndInteraction();
        },

        /**
         * Creates vector layers for profile line and hover indicator, and sets up Draw interaction.
         */
        setupLayersAndInteraction () {
            if (!this.vectorSource) {
                this.vectorSource = new VectorSource();
            }

            if (!this.vectorLayer) {
                this.vectorLayer = new VectorLayer({
                    source: this.vectorSource,
                    id: "voibos-profile-line-layer",
                    name: "Voibos Profil Line Layer",
                    alwaysOnTop: true,
                    zIndex: 9998,
                    style: new Style({
                        stroke: new Stroke({
                            color: "#0d6efd",
                            width: 3.5
                        })
                    })
                });
            }

            if (!this.indicatorSource) {
                this.indicatorSource = new VectorSource();
            }

            if (!this.indicatorLayer) {
                this.indicatorLayer = new VectorLayer({
                    source: this.indicatorSource,
                    id: "voibos-profile-indicator-layer",
                    name: "Voibos Profil Indicator Layer",
                    alwaysOnTop: true,
                    zIndex: 9999,
                    style: [
                        new Style({
                            image: new Circle({
                                radius: 9,
                                fill: new Fill({color: "#fd7e14"}),
                                stroke: new Stroke({color: "#ffffff", width: 2.5})
                            })
                        }),
                        new Style({
                            image: new Circle({
                                radius: 4,
                                fill: new Fill({color: "#ffffff"})
                            })
                        })
                    ]
                });
            }

            if (this.map) {
                const layers = this.map.getLayers().getArray();

                if (!layers.includes(this.vectorLayer)) {
                    this.map.addLayer(this.vectorLayer);
                }
                if (!layers.includes(this.indicatorLayer)) {
                    this.map.addLayer(this.indicatorLayer);
                }
            }

            this.setupDrawInteraction();
        },

        /**
         * Sets up OpenLayers LineString draw interaction.
         */
        setupDrawInteraction () {
            if (!this.drawInteraction) {
                this.drawInteraction = new Draw({
                    source: this.vectorSource,
                    type: "LineString"
                });

                this.drawInteraction.on("drawstart", () => {
                    this.resetData();
                    this.isDrawingActive = true;
                });

                this.drawInteraction.on("drawend", (event) => {
                    this.handleDrawEnd(event);
                });
            }

            if (this.map && !this.map.getInteractions().getArray().includes(this.drawInteraction)) {
                this.map.addInteraction(this.drawInteraction);
            }
        },

        /**
         * Handles drawend event when line is completed.
         * @param {Object} event OpenLayers Draw event.
         */
        async handleDrawEnd (event) {
            this.isDrawingActive = false;

            const coords = event?.feature?.getGeometry()?.getCoordinates();

            if (!Array.isArray(coords) || coords.length < 2) {
                this.errorMessage = this.$t("additional:modules.tools.voibosTools.profile.errorFewPoints");
                return;
            }

            this.drawnCoordsMap = coords;

            // Transform coordinates to Voibos CRS (EPSG:31287)
            const transformed = [];

            for (const c of coords) {
                const pt = coordinateService.transform(c, "EPSG:3857", this.targetCrs);

                if (coordinateService.isValidCoordinate(pt)) {
                    transformed.push(pt);
                }
            }

            if (transformed.length < 2) {
                this.errorMessage = this.$t("additional:modules.tools.voibosTools.profile.errorGeneric");
                return;
            }

            this.drawnCoordsVoibos = transformed;
            await this.queryProfileService();
        },

        /**
         * Queries Voibos profile service for current line coordinates.
         */
        async queryProfileService () {
            if (!this.drawnCoordsVoibos || this.drawnCoordsVoibos.length < 2) {
                return;
            }

            this.isLoading = true;
            this.errorMessage = null;

            try {
                const response = await voibosApi.fetchProfile({
                    coordinates: this.drawnCoordsVoibos,
                    stepDistance: this.stepDistance,
                    crs: this.targetCrs
                });

                this.profileData = voibosApi.parseProfileData(response);

                if (!this.profileData || !this.profileData.points || this.profileData.points.length === 0) {
                    this.errorMessage = this.$t("additional:modules.tools.voibosTools.profile.errorGeneric");
                }
            }
            catch (error) {
                this.errorMessage = error?.message || this.$t("additional:modules.tools.voibosTools.profile.errorGeneric");
                this.profileData = null;
            }
            finally {
                this.isLoading = false;
            }
        },

        /**
         * Starts a new drawing session, clearing previous line and profile.
         */
        startNewDrawing () {
            this.reset();
            this.isDrawingActive = true;
            if (this.drawInteraction && this.map && !this.map.getInteractions().getArray().includes(this.drawInteraction)) {
                this.map.addInteraction(this.drawInteraction);
            }
        },

        /**
         * Recalculates profile when step distance setting changes.
         */
        async onStepDistanceChange () {
            if (this.drawnCoordsVoibos && this.drawnCoordsVoibos.length >= 2) {
                await this.queryProfileService();
            }
        },

        /**
         * Scales horizontal distance to SVG X coordinate.
         * @param {Number} dist Distance in meters.
         * @returns {Number} Scaled X coordinate.
         */
        scaleX (dist) {
            if (!this.profileData || this.profileData.totalDistance <= 0) {
                return this.svgPadding.left;
            }
            const ratio = dist / this.profileData.totalDistance;

            return this.svgPadding.left + ratio * this.plotWidth;
        },

        /**
         * Scales elevation to SVG Y coordinate.
         * @param {Number} elev Elevation in meters ü. A.
         * @returns {Number} Scaled Y coordinate.
         */
        scaleY (elev) {
            const {min, max} = this.elevationBounds,
                  range = max - min || 1,
                  ratio = (elev - min) / range;

            return this.svgPadding.top + this.plotHeight - (ratio * this.plotHeight);
        },

        /**
         * Builds SVG path data string for DTM or DSM line.
         * @param {"dtm"|"dsm"} type Elevation type.
         * @returns {String} SVG path data.
         */
        buildSvgLinePath (type) {
            if (!this.profileData?.points || this.profileData.points.length === 0) {
                return "";
            }

            return this.profileData.points.reduce((path, pt, idx) => {
                const x = this.scaleX(pt.distance),
                      val = type === "dsm" ? pt.dsm : pt.dtm,
                      y = this.scaleY(isNaN(val) ? this.elevationBounds.min : val),
                      cmd = idx === 0 ? "M" : "L";

                return `${path} ${cmd} ${x.toFixed(1)} ${y.toFixed(1)}`;
            }, "").trim();
        },

        /**
         * Handles mouse hover over the SVG chart; syncs indicator on map.
         * @param {MouseEvent} event DOM MouseEvent.
         */
        handleChartMouseMove (event) {
            if (!this.profileData?.points || this.profileData.points.length === 0) {
                return;
            }

            const svgRect = this.$refs.chartSvg?.getBoundingClientRect();

            if (!svgRect) {
                return;
            }

            // Calculate mouse position in SVG coordinate system
            const mouseX = ((event.clientX - svgRect.left) / svgRect.width) * this.svgWidth,
                  plotLeft = this.svgPadding.left,
                  plotRight = this.svgPadding.left + this.plotWidth;

            if (mouseX < plotLeft || mouseX > plotRight) {
                this.handleChartMouseLeave();
                return;
            }

            const distRatio = (mouseX - plotLeft) / this.plotWidth,
                  targetDist = distRatio * this.profileData.totalDistance;

            // Find closest point by distance
            let closest = this.profileData.points[0],
                minDiff = Math.abs(closest.distance - targetDist);

            for (let i = 1; i < this.profileData.points.length; i++) {
                const pt = this.profileData.points[i],
                      diff = Math.abs(pt.distance - targetDist);

                if (diff < minDiff) {
                    minDiff = diff;
                    closest = pt;
                }
            }

            this.hoveredPoint = closest;
            this.updateMapIndicator(closest);
        },

        /**
         * Clears hovered point and removes indicator from the map.
         */
        handleChartMouseLeave () {
            this.hoveredPoint = null;
            if (this.indicatorSource) {
                this.indicatorSource.clear();
            }
        },

        /**
         * Updates marker point indicator on map to match hovered chart location.
         * @param {Object} point Hovered profile point.
         */
        updateMapIndicator (point) {
            if (!this.indicatorSource || !point || point.x === undefined || point.y === undefined) {
                return;
            }

            const mapCoord = coordinateService.transform(
                [point.x, point.y],
                this.targetCrs,
                "EPSG:3857"
            );

            if (!coordinateService.isValidCoordinate(mapCoord)) {
                return;
            }

            this.indicatorSource.clear();

            const feature = new Feature({
                geometry: new Point(mapCoord)
            });

            this.indicatorSource.addFeature(feature);
        },

        /**
         * Resets current query data and clearing features.
         */
        resetData () {
            this.profileData = null;
            this.hoveredPoint = null;
            this.errorMessage = null;

            if (this.vectorSource) {
                this.vectorSource.clear();
            }
            if (this.indicatorSource) {
                this.indicatorSource.clear();
            }
        },

        /**
         * Complete reset of line, data, and drawing state.
         */
        reset () {
            this.resetData();
            this.drawnCoordsMap = [];
            this.drawnCoordsVoibos = [];
            this.isDrawingActive = true;
        },

        /**
         * Cleans up map listener, interactions, and vector layers.
         */
        cleanup () {
            if (this.mapCheckInterval) {
                clearInterval(this.mapCheckInterval);
                this.mapCheckInterval = null;
            }

            if (this.map) {
                if (this.drawInteraction) {
                    this.map.removeInteraction(this.drawInteraction);
                }
                if (this.vectorSource) {
                    this.vectorSource.clear();
                }
                if (this.indicatorSource) {
                    this.indicatorSource.clear();
                }
                if (this.vectorLayer) {
                    this.map.removeLayer(this.vectorLayer);
                }
                if (this.indicatorLayer) {
                    this.map.removeLayer(this.indicatorLayer);
                }
            }
        },

        /**
         * Formats a number with locale digits.
         * @param {Number|String} val
         * @param {Number} [decimals=1]
         * @returns {String} Formatted number string.
         */
        formatNumber (val, decimals = 1) {
            if (typeof val === "number" && !isNaN(val)) {
                return val.toLocaleString("de-AT", {
                    minimumFractionDigits: decimals,
                    maximumFractionDigits: decimals
                });
            }
            return String(val ?? "-");
        },

        /**
         * Formats distance in meters or kilometers.
         * @param {Number} dist Distance in meters.
         * @returns {String} Formatted distance string.
         */
        formatDistance (dist) {
            if (typeof dist !== "number" || isNaN(dist)) {
                return "-";
            }
            if (dist >= 1000) {
                return `${this.formatNumber(dist / 1000, 2)} km`;
            }
            return `${this.formatNumber(dist, 0)} m`;
        }
    }
};
</script>

<template>
    <div
        id="voibos-profilservice"
        class="voibos-profilservice p-1"
    >
        <!-- Instructions / Draw Action Card -->
        <div class="card shadow-sm mb-3 border-0 bg-light">
            <div class="card-body p-3">
                <div class="d-flex justify-content-between align-items-center mb-2">
                    <span class="small fw-semibold text-secondary">
                        <i
                            class="bi bi-pencil-fill me-1"
                            aria-hidden="true"
                        />
                        {{ $t("additional:modules.tools.voibosTools.profile.title") }}
                    </span>
                    <span
                        v-if="isDrawingActive && !drawnCoordsVoibos.length"
                        class="badge bg-primary"
                    >
                        {{ $t("additional:modules.tools.voibosTools.profile.drawingActive") }}
                    </span>
                </div>

                <div class="d-flex gap-2">
                    <button
                        type="button"
                        class="btn btn-sm w-100"
                        :class="isDrawingActive ? 'btn-primary' : 'btn-outline-primary'"
                        @click="startNewDrawing"
                    >
                        <i
                            class="bi bi-bezier2 me-1"
                            aria-hidden="true"
                        />
                        {{ drawnCoordsVoibos.length
                            ? $t("additional:modules.tools.voibosTools.profile.newProfileBtn")
                            : $t("additional:modules.tools.voibosTools.profile.drawLineBtn")
                        }}
                    </button>
                </div>

                <!-- Settings: Step Distance -->
                <div class="d-flex align-items-center justify-content-between mt-3 pt-2 border-top small text-muted">
                    <label
                        for="profil-step-distance"
                        class="form-label m-0 small"
                    >
                        {{ $t("additional:modules.tools.voibosTools.profile.stepDistance") }}:
                    </label>
                    <select
                        id="profil-step-distance"
                        v-model.number="stepDistance"
                        class="form-select form-select-sm w-auto py-0"
                        @change="onStepDistanceChange"
                    >
                        <option :value="5">
                            5 m
                        </option>
                        <option :value="10">
                            10 m (Standard)
                        </option>
                        <option :value="20">
                            20 m
                        </option>
                        <option :value="50">
                            50 m
                        </option>
                    </select>
                </div>
            </div>
        </div>

        <!-- Initial Hint Banner -->
        <div
            v-if="!drawnCoordsVoibos.length && !isLoading"
            class="alert alert-info d-flex align-items-center mb-3 py-2 px-3 small"
            role="status"
        >
            <i
                class="bi bi-cursor-fill me-2 fs-5"
                aria-hidden="true"
            />
            <div>{{ $t("additional:modules.tools.voibosTools.profile.instruction") }}</div>
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
                {{ $t("additional:modules.tools.voibosTools.profile.loading") }}
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

        <!-- Profile Results Display -->
        <div
            v-if="profileData && !isLoading"
            class="profile-results"
        >
            <!-- Elevation Profile SVG Chart Card -->
            <div class="card shadow-sm mb-3 border-0 bg-white">
                <div class="card-body p-2">
                    <div class="d-flex justify-content-between align-items-center mb-2 px-1">
                        <span class="small fw-bold">
                            <i
                                class="bi bi-graph-up me-1 text-primary"
                                aria-hidden="true"
                            />
                            Höhenprofil
                        </span>
                        <!-- Legend -->
                        <div class="d-flex gap-3 small">
                            <span class="d-flex align-items-center">
                                <span class="legend-color-box dtm me-1" />
                                <small class="text-muted">{{ $t("additional:modules.tools.voibosTools.profile.dtmLegend") }}</small>
                            </span>
                            <span class="d-flex align-items-center">
                                <span class="legend-color-box dsm me-1" />
                                <small class="text-muted">{{ $t("additional:modules.tools.voibosTools.profile.dsmLegend") }}</small>
                            </span>
                        </div>
                    </div>

                    <!-- SVG Chart -->
                    <div class="chart-container position-relative">
                        <!-- eslint-disable-next-line vuejs-accessibility/mouse-events-have-key-events, vuejs-accessibility/no-static-element-interactions -->
                        <svg
                            ref="chartSvg"
                            :viewBox="`0 0 ${svgWidth} ${svgHeight}`"
                            class="profile-svg w-100"
                            preserveAspectRatio="none"
                            @mousemove="handleChartMouseMove"
                            @mouseleave="handleChartMouseLeave"
                        >
                            <!-- Background gradient for DTM fill -->
                            <defs>
                                <linearGradient
                                    id="dtmGradient"
                                    x1="0"
                                    x2="0"
                                    y1="0"
                                    y2="1"
                                >
                                    <stop
                                        offset="0%"
                                        stop-color="#0d6efd"
                                        stop-opacity="0.35"
                                    />
                                    <stop
                                        offset="100%"
                                        stop-color="#0d6efd"
                                        stop-opacity="0.05"
                                    />
                                </linearGradient>
                            </defs>

                            <!-- Horizontal Grid Lines (Elevation) -->
                            <g class="grid-lines-y">
                                <line
                                    v-for="tick in elevationTicks"
                                    :key="`y-line-${tick.value}`"
                                    :x1="svgPadding.left"
                                    :x2="svgPadding.left + plotWidth"
                                    :y1="tick.y"
                                    :y2="tick.y"
                                    stroke="#e9ecef"
                                    stroke-width="1"
                                    stroke-dasharray="2 2"
                                />
                                <text
                                    v-for="tick in elevationTicks"
                                    :key="`y-text-${tick.value}`"
                                    :x="svgPadding.left - 6"
                                    :y="tick.y + 4"
                                    text-anchor="end"
                                    class="chart-axis-label"
                                >
                                    {{ tick.label }}
                                </text>
                            </g>

                            <!-- Vertical Grid Lines (Distance) -->
                            <g class="grid-lines-x">
                                <line
                                    v-for="tick in distanceTicks"
                                    :key="`x-line-${tick.value}`"
                                    :x1="tick.x"
                                    :x2="tick.x"
                                    :y1="svgPadding.top"
                                    :y2="svgPadding.top + plotHeight"
                                    stroke="#e9ecef"
                                    stroke-width="1"
                                    stroke-dasharray="2 2"
                                />
                                <text
                                    v-for="tick in distanceTicks"
                                    :key="`x-text-${tick.value}`"
                                    :x="tick.x"
                                    :y="svgPadding.top + plotHeight + 16"
                                    text-anchor="middle"
                                    class="chart-axis-label"
                                >
                                    {{ tick.label }}
                                </text>
                            </g>

                            <!-- DTM Area Fill -->
                            <path
                                v-if="dtmAreaPath"
                                :d="dtmAreaPath"
                                fill="url(#dtmGradient)"
                            />

                            <!-- DSM Line (Surface / Vegetation / Buildings) -->
                            <path
                                v-if="dsmPath"
                                :d="dsmPath"
                                fill="none"
                                stroke="#6c757d"
                                stroke-width="1.8"
                                stroke-dasharray="4 3"
                            />

                            <!-- DTM Line (Ground Terrain) -->
                            <path
                                v-if="dtmPath"
                                :d="dtmPath"
                                fill="none"
                                stroke="#0d6efd"
                                stroke-width="2.5"
                            />

                            <!-- Hover Crosshair & Indicators -->
                            <g
                                v-if="hoveredPoint"
                                class="hover-indicator-group"
                            >
                                <!-- Vertical Crosshair line -->
                                <line
                                    :x1="scaleX(hoveredPoint.distance)"
                                    :x2="scaleX(hoveredPoint.distance)"
                                    :y1="svgPadding.top"
                                    :y2="svgPadding.top + plotHeight"
                                    stroke="#fd7e14"
                                    stroke-width="1.5"
                                    stroke-dasharray="3 3"
                                />

                                <!-- Hover Dot on DSM -->
                                <circle
                                    v-if="!isNaN(hoveredPoint.dsm)"
                                    :cx="scaleX(hoveredPoint.distance)"
                                    :cy="scaleY(hoveredPoint.dsm)"
                                    r="4.5"
                                    fill="#6c757d"
                                    stroke="#ffffff"
                                    stroke-width="1.5"
                                />

                                <!-- Hover Dot on DTM -->
                                <circle
                                    v-if="!isNaN(hoveredPoint.dtm)"
                                    :cx="scaleX(hoveredPoint.distance)"
                                    :cy="scaleY(hoveredPoint.dtm)"
                                    r="5.5"
                                    fill="#fd7e14"
                                    stroke="#ffffff"
                                    stroke-width="2"
                                />
                            </g>
                        </svg>

                        <!-- Live Hover Tooltip Card -->
                        <div
                            v-if="hoveredPoint"
                            class="hover-tooltip-card shadow-sm p-2 bg-dark text-white rounded small"
                        >
                            <div class="fw-bold border-bottom pb-1 mb-1 text-warning">
                                <i
                                    class="bi bi-geo-alt-fill me-1"
                                    aria-hidden="true"
                                />
                                {{ formatDistance(hoveredPoint.distance) }}
                            </div>
                            <div class="d-flex justify-content-between gap-3">
                                <span>{{ $t("additional:modules.tools.voibosTools.profile.tooltipDtm") }}:</span>
                                <strong>{{ formatNumber(hoveredPoint.dtm, 1) }} m</strong>
                            </div>
                            <div
                                v-if="!isNaN(hoveredPoint.dsm)"
                                class="d-flex justify-content-between gap-3"
                            >
                                <span>{{ $t("additional:modules.tools.voibosTools.profile.tooltipDsm") }}:</span>
                                <span>{{ formatNumber(hoveredPoint.dsm, 1) }} m</span>
                            </div>
                            <div
                                v-if="!isNaN(hoveredPoint.dsm) && !isNaN(hoveredPoint.dtm) && (hoveredPoint.dsm - hoveredPoint.dtm) > 0.3"
                                class="d-flex justify-content-between gap-3 text-info"
                            >
                                <span>{{ $t("additional:modules.tools.voibosTools.profile.tooltipDelta") }}:</span>
                                <span>+{{ formatNumber(hoveredPoint.dsm - hoveredPoint.dtm, 1) }} m</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Profile Summary Statistics Card -->
            <div class="card shadow-sm mb-3 border-0 bg-light">
                <div class="card-body p-3">
                    <h6 class="card-title mb-2 fs-6 fw-bold">
                        <i
                            class="bi bi-info-circle-fill me-2 text-primary"
                            aria-hidden="true"
                        />
                        Kennzahlen zum Profil
                    </h6>

                    <div class="row g-2 text-center pt-1">
                        <!-- Total Distance -->
                        <div class="col-6 col-sm-4 border-end">
                            <span class="text-muted small d-block">
                                {{ $t("additional:modules.tools.voibosTools.profile.totalDistance") }}
                            </span>
                            <span class="fw-bold fs-6 text-dark d-block">
                                {{ formatDistance(profileData.totalDistance) }}
                            </span>
                        </div>

                        <!-- Elevation Difference -->
                        <div class="col-6 col-sm-4 border-end">
                            <span class="text-muted small d-block">
                                {{ $t("additional:modules.tools.voibosTools.profile.elevationDiff") }}
                            </span>
                            <span class="fw-bold fs-6 text-dark d-block">
                                {{ formatNumber(profileData.elevationDifference, 1) }} m
                            </span>
                        </div>

                        <!-- Min / Max Elevation -->
                        <div class="col-12 col-sm-4">
                            <span class="text-muted small d-block">
                                {{ $t("additional:modules.tools.voibosTools.profile.minElevation") }} / {{ $t("additional:modules.tools.voibosTools.profile.maxElevation") }}
                            </span>
                            <span class="fw-bold fs-6 text-dark d-block">
                                {{ formatNumber(profileData.minDtm, 0) }} / {{ formatNumber(profileData.maxDtm, 0) }} m
                            </span>
                        </div>
                    </div>

                    <!-- Ascent & Descent row -->
                    <div class="row g-2 text-center pt-2 mt-2 border-top">
                        <div class="col-6">
                            <span class="text-muted small d-block">
                                <i
                                    class="bi bi-arrow-up-right text-success me-1"
                                    aria-hidden="true"
                                />
                                {{ $t("additional:modules.tools.voibosTools.profile.elevationGain") }}
                            </span>
                            <span class="fw-semibold text-success">
                                +{{ formatNumber(profileData.elevationGain, 0) }} m
                            </span>
                        </div>
                        <div class="col-6">
                            <span class="text-muted small d-block">
                                <i
                                    class="bi bi-arrow-down-right text-danger me-1"
                                    aria-hidden="true"
                                />
                                {{ $t("additional:modules.tools.voibosTools.profile.elevationLoss") }}
                            </span>
                            <span class="fw-semibold text-danger">
                                -{{ formatNumber(profileData.elevationLoss, 0) }} m
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Bottom Actions: Reset -->
            <div class="mt-2">
                <button
                    type="button"
                    class="btn btn-outline-secondary btn-sm w-100"
                    @click="reset"
                >
                    <i
                        class="bi bi-arrow-counterclockwise me-1"
                        aria-hidden="true"
                    />
                    {{ $t("additional:modules.tools.voibosTools.profile.reset") }}
                </button>
            </div>
        </div>
    </div>
</template>

<style lang="scss" scoped>
.voibos-profilservice {
    width: 100%;
}

.card {
    border-radius: 8px;
}

.legend-color-box {
    display: inline-block;
    width: 14px;
    height: 4px;
    border-radius: 2px;

    &.dtm {
        background-color: #0d6efd;
    }

    &.dsm {
        background-color: #6c757d;
        border-top: 2px dashed #6c757d;
    }
}

.chart-container {
    user-select: none;
    position: relative;
}

.profile-svg {
    height: 220px;
    cursor: crosshair;
}

.chart-axis-label {
    font-size: 10px;
    fill: #6c757d;
    font-family: inherit;
}

.hover-tooltip-card {
    position: absolute;
    top: 10px;
    right: 15px;
    pointer-events: none;
    z-index: 10;
    font-size: 11px;
    opacity: 0.95;
    min-width: 130px;
}
</style>
