import {expect} from "chai";
import sinon from "sinon";
import {mount} from "@vue/test-utils";
import mapCollection from "@core/maps/js/mapCollection.js";
import WegzeitService from "../../../components/WegzeitService.vue";
import voibosApi from "../../../services/voibosApi.js";
import coordinateService from "../../../services/coordinateService.js";

describe("addons/voibosTools/components/WegzeitService.vue", () => {
    let mockMap,
        layersArray,
        fetchTravelTimeStub,
        parseTravelTimeDataStub,
        transformStub;

    const mockTravelTimeData = {
        status: "erfolgreich",
        distance2D: 1999,
        distance3D: 2034,
        ascent: 57,
        descent: 70,
        elevationDiff: -12,
        minElevation: 155,
        maxElevation: 172,
        maxSlope: 12,
        method: "DIN33466",
        timeOneWay: 45,
        timeReturn: 40,
        timeRoundTrip: 85,
        marchingTimeOneWay: 50,
        marchingTimeReturn: 45,
        marchingTimeRoundTrip: 95,
        segments: [
            {
                index: 1,
                distance: 2034,
                ascent: 57,
                descent: 70,
                timeOneWay: 45,
                timeReturn: 40,
                timeTotal: 85
            }
        ],
        dataSource: "Laserscanning 2025"
    };

    beforeEach(() => {
        layersArray = [];
        mockMap = {
            mode: "2D",
            on: sinon.spy(),
            un: sinon.spy(),
            addLayer: sinon.spy(layer => layersArray.push(layer)),
            removeLayer: sinon.spy(layer => {
                const idx = layersArray.indexOf(layer);

                if (idx > -1) {
                    layersArray.splice(idx, 1);
                }
            }),
            getLayers: () => ({
                getArray: () => layersArray
            })
        };

        sinon.stub(mapCollection, "getMap").callsFake(mode => mode === "2D" ? mockMap : null);
        fetchTravelTimeStub = sinon.stub(voibosApi, "fetchTravelTime");
        parseTravelTimeDataStub = sinon.stub(voibosApi, "parseTravelTimeData");
        transformStub = sinon.stub(coordinateService, "transform").callsFake(coord => coord);
    });

    afterEach(() => {
        sinon.restore();
    });

    it("registers singleclick listener and adds vector layer on mount", () => {
        const wrapper = mount(WegzeitService, {
            global: {
                mocks: {
                    $t: key => key
                }
            }
        });

        expect(mockMap.on.calledOnceWith("singleclick")).to.be.true;
        expect(mockMap.addLayer.calledOnce).to.be.true;
        expect(wrapper.vm.vectorLayer).to.not.be.null;
    });

    it("removes singleclick listener and vector layer on unmount", () => {
        const wrapper = mount(WegzeitService, {
            global: {
                mocks: {
                    $t: key => key
                }
            }
        });

        wrapper.unmount();

        expect(mockMap.un.calledOnceWith("singleclick")).to.be.true;
        expect(mockMap.removeLayer.calledOnce).to.be.true;
    });

    it("handles map click, adds waypoints, and renders numbered markers and connecting dashed line", async () => {
        transformStub.onFirstCall().returns([625919, 483187]);
        transformStub.onSecondCall().returns([626500, 483200]);

        const wrapper = mount(WegzeitService, {
            global: {
                mocks: {
                    $t: key => key
                }
            }
        });

        // Click 1: Start point
        await wrapper.vm.handleMapClick({coordinate: [1822700, 6141500]});
        await wrapper.vm.$nextTick();

        expect(wrapper.vm.waypoints).to.have.lengthOf(1);
        // Only 1 marker point feature
        expect(wrapper.vm.vectorSource.getFeatures()).to.have.lengthOf(1);
        expect(fetchTravelTimeStub.called).to.be.false;

        // Click 2: Destination point
        await wrapper.vm.handleMapClick({coordinate: [1823500, 6142000]});
        await wrapper.vm.$nextTick();

        expect(wrapper.vm.waypoints).to.have.lengthOf(2);
        // 2 marker points + 1 connecting LineString feature = 3 features
        expect(wrapper.vm.vectorSource.getFeatures()).to.have.lengthOf(3);
    });

    it("automatically queries Voibos wegzeit when 2 or more waypoints are added", async () => {
        transformStub.onFirstCall().returns([625919, 483187]);
        transformStub.onSecondCall().returns([626500, 483200]);
        fetchTravelTimeStub.resolves({Abfragestatus: "erfolgreich"});
        parseTravelTimeDataStub.returns(mockTravelTimeData);

        const wrapper = mount(WegzeitService, {
            global: {
                mocks: {
                    $t: key => key
                }
            }
        });

        await wrapper.vm.handleMapClick({coordinate: [1822700, 6141500]});
        await wrapper.vm.handleMapClick({coordinate: [1823500, 6142000]});
        await wrapper.vm.$nextTick();

        expect(fetchTravelTimeStub.calledOnce).to.be.true;
        expect(wrapper.vm.travelTimeData).to.deep.equal(mockTravelTimeData);

        const html = wrapper.html();

        expect(html).to.include("45 min");
        expect(html).to.include("2.03 km");
        expect(html).to.include("+57 m");
        expect(html).to.include("-70 m");
    });

    it("displays error message when coordinate is outside Austria", async () => {
        transformStub.returns([50000, 100000]); // Outside Austrian Lambert bounds

        const wrapper = mount(WegzeitService, {
            global: {
                mocks: {
                    $t: key => key
                }
            }
        });

        await wrapper.vm.handleMapClick({coordinate: [999999, 999999]});
        await wrapper.vm.$nextTick();

        expect(wrapper.vm.errorMessage).to.equal("additional:modules.tools.voibosTools.routing.notInAustria");
        expect(wrapper.vm.waypoints).to.have.lengthOf(0);
    });

    it("allows removing a waypoint and updates map features and calculations", async () => {
        const wrapper = mount(WegzeitService, {
            global: {
                mocks: {
                    $t: key => key
                }
            }
        });

        wrapper.vm.waypoints = [
            {id: 1, coordMap: [100, 100], coordVoibos: [625919, 483187]},
            {id: 2, coordMap: [200, 200], coordVoibos: [626500, 483200]},
            {id: 3, coordMap: [300, 300], coordVoibos: [627000, 483250]}
        ];
        wrapper.vm.updateMapFeatures();

        expect(wrapper.vm.vectorSource.getFeatures()).to.have.lengthOf(4); // 3 points + 1 line

        fetchTravelTimeStub.resolves({Abfragestatus: "erfolgreich"});
        parseTravelTimeDataStub.returns(mockTravelTimeData);

        await wrapper.vm.removeWaypoint(1); // Remove intermediate point
        await wrapper.vm.$nextTick();

        expect(wrapper.vm.waypoints).to.have.lengthOf(2);
        expect(wrapper.vm.vectorSource.getFeatures()).to.have.lengthOf(3); // 2 points + 1 line
        expect(fetchTravelTimeStub.calledOnce).to.be.true;
    });

    it("allows reordering waypoints up and down", async () => {
        const wrapper = mount(WegzeitService, {
            global: {
                mocks: {
                    $t: key => key
                }
            }
        });

        wrapper.vm.waypoints = [
            {id: 1, coordMap: [100, 100], coordVoibos: [625919, 483187]},
            {id: 2, coordMap: [200, 200], coordVoibos: [626500, 483200]}
        ];

        fetchTravelTimeStub.resolves({Abfragestatus: "erfolgreich"});
        parseTravelTimeDataStub.returns(mockTravelTimeData);

        // Move second point up to become first point
        await wrapper.vm.moveWaypointUp(1);
        await wrapper.vm.$nextTick();

        expect(wrapper.vm.waypoints[0].id).to.equal(2);
        expect(wrapper.vm.waypoints[1].id).to.equal(1);

        // Move first point down
        await wrapper.vm.moveWaypointDown(0);
        await wrapper.vm.$nextTick();

        expect(wrapper.vm.waypoints[0].id).to.equal(1);
        expect(wrapper.vm.waypoints[1].id).to.equal(2);
    });

    it("clears all waypoints and results when reset is called", async () => {
        const wrapper = mount(WegzeitService, {
            global: {
                mocks: {
                    $t: key => key
                }
            }
        });

        wrapper.vm.waypoints = [
            {id: 1, coordMap: [100, 100], coordVoibos: [625919, 483187]},
            {id: 2, coordMap: [200, 200], coordVoibos: [626500, 483200]}
        ];
        wrapper.vm.travelTimeData = mockTravelTimeData;
        wrapper.vm.updateMapFeatures();

        expect(wrapper.vm.vectorSource.getFeatures()).to.have.lengthOf(3);

        wrapper.vm.reset();

        expect(wrapper.vm.waypoints).to.have.lengthOf(0);
        expect(wrapper.vm.travelTimeData).to.be.null;
        expect(wrapper.vm.vectorSource.getFeatures()).to.have.lengthOf(0);
    });

    it("recalculates when calculation method changes", async () => {
        fetchTravelTimeStub.resolves({Abfragestatus: "erfolgreich"});
        parseTravelTimeDataStub.returns(mockTravelTimeData);

        const wrapper = mount(WegzeitService, {
            global: {
                mocks: {
                    $t: key => key
                }
            }
        });

        wrapper.vm.waypoints = [
            {id: 1, coordMap: [100, 100], coordVoibos: [625919, 483187]},
            {id: 2, coordMap: [200, 200], coordVoibos: [626500, 483200]}
        ];

        wrapper.vm.selectedMethod = "SAC";
        await wrapper.vm.$nextTick();

        expect(fetchTravelTimeStub.calledOnce).to.be.true;
        expect(fetchTravelTimeStub.firstCall.args[0].method).to.equal("SAC");
    });
});
