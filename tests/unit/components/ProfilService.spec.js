import {expect} from "chai";
import sinon from "sinon";
import {mount} from "@vue/test-utils";
import Feature from "ol/Feature.js";
import LineString from "ol/geom/LineString.js";
import mapCollection from "@core/maps/js/mapCollection.js";
import ProfilService from "../../../components/ProfilService.vue";
import voibosApi from "../../../services/voibosApi.js";
import coordinateService from "../../../services/coordinateService.js";

describe("addons/voibosTools/components/ProfilService.vue", () => {
    let mockMap,
        layersArray,
        interactionsArray,
        fetchProfileStub,
        parseProfileDataStub;

    const mockProfileData = {
        points: [
            {index: 0, distance: 0, x: 625919, y: 483187, dtm: 200, dsm: 205},
            {index: 1, distance: 50, x: 625950, y: 483200, dtm: 250, dsm: 255},
            {index: 2, distance: 100, x: 626000, y: 483250, dtm: 220, dsm: 225}
        ],
        totalDistance: 100,
        minDtm: 200,
        maxDtm: 250,
        minDsm: 205,
        maxDsm: 255,
        elevationDifference: 50,
        elevationGain: 50,
        elevationLoss: 30,
        dataSource: "ALS DTM/DSM",
        flightYears: "2023"
    };

    beforeEach(() => {
        layersArray = [];
        interactionsArray = [];

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
            }),
            addInteraction: sinon.spy(interaction => interactionsArray.push(interaction)),
            removeInteraction: sinon.spy(interaction => {
                const idx = interactionsArray.indexOf(interaction);

                if (idx > -1) {
                    interactionsArray.splice(idx, 1);
                }
            }),
            getInteractions: () => ({
                getArray: () => interactionsArray
            })
        };

        sinon.stub(mapCollection, "getMap").callsFake(mode => mode === "2D" ? mockMap : null);
        fetchProfileStub = sinon.stub(voibosApi, "fetchProfile");
        parseProfileDataStub = sinon.stub(voibosApi, "parseProfileData");
        sinon.stub(coordinateService, "transform").callsFake(coord => coord);
    });

    afterEach(() => {
        sinon.restore();
    });

    it("registers vector layers and draw interaction on mount", () => {
        const wrapper = mount(ProfilService, {
            global: {
                mocks: {
                    $t: key => key
                }
            }
        });

        expect(mockMap.addLayer.calledTwice).to.be.true;
        expect(mockMap.addInteraction.calledOnce).to.be.true;
        expect(wrapper.vm.vectorLayer).to.not.be.null;
        expect(wrapper.vm.indicatorLayer).to.not.be.null;
        expect(wrapper.vm.drawInteraction).to.not.be.null;
    });

    it("removes draw interaction and layers on unmount", () => {
        const wrapper = mount(ProfilService, {
            global: {
                mocks: {
                    $t: key => key
                }
            }
        });

        wrapper.unmount();

        expect(mockMap.removeInteraction.calledOnce).to.be.true;
        expect(mockMap.removeLayer.calledTwice).to.be.true;
    });

    it("handles drawend event, queries Voibos profilservice, and displays profile stats", async () => {
        fetchProfileStub.resolves({abfragestatus: "erfolgreich", stuetzpunkte: []});
        parseProfileDataStub.returns(mockProfileData);

        const wrapper = mount(ProfilService, {
            global: {
                mocks: {
                    $t: key => key
                }
            }
        });

        const lineFeature = new Feature({
            geometry: new LineString([
                [1822700, 6141500],
                [1822800, 6141600]
            ])
        });

        await wrapper.vm.handleDrawEnd({feature: lineFeature});
        await wrapper.vm.$nextTick();

        expect(fetchProfileStub.calledOnce).to.be.true;
        expect(wrapper.vm.profileData).to.deep.equal(mockProfileData);
        expect(wrapper.vm.errorMessage).to.be.null;

        const html = wrapper.html();

        expect(html).to.include("profile-svg");
        expect(html).to.include("100 m");
    });

    it("displays error message if drawn line has fewer than 2 points", async () => {
        const wrapper = mount(ProfilService, {
            global: {
                mocks: {
                    $t: key => key
                }
            }
        });

        const singlePointFeature = new Feature({
            geometry: new LineString([[1822700, 6141500]])
        });

        await wrapper.vm.handleDrawEnd({feature: singlePointFeature});
        await wrapper.vm.$nextTick();

        expect(wrapper.vm.errorMessage).to.equal("additional:modules.tools.voibosTools.profile.errorFewPoints");
        expect(fetchProfileStub.called).to.be.false;
    });

    it("displays error message when API call fails", async () => {
        fetchProfileStub.rejects(new Error("Voibos API offline"));

        const wrapper = mount(ProfilService, {
            global: {
                mocks: {
                    $t: key => key
                }
            }
        });

        const lineFeature = new Feature({
            geometry: new LineString([
                [1822700, 6141500],
                [1822800, 6141600]
            ])
        });

        await wrapper.vm.handleDrawEnd({feature: lineFeature});
        await wrapper.vm.$nextTick();

        expect(wrapper.vm.errorMessage).to.equal("Voibos API offline");
        expect(wrapper.vm.profileData).to.be.null;
    });

    it("handles mouse hover over chart and updates map indicator", async () => {
        const wrapper = mount(ProfilService, {
            global: {
                mocks: {
                    $t: key => key
                }
            }
        });

        wrapper.vm.profileData = mockProfileData;
        await wrapper.vm.$nextTick();

        // Stub getBoundingClientRect on chartSvg
        if (wrapper.vm.$refs.chartSvg) {
            wrapper.vm.$refs.chartSvg.getBoundingClientRect = () => ({
                left: 0,
                top: 0,
                width: 600,
                height: 220
            });
        }

        // Simulate mouse move at ~50% of the SVG chart width
        wrapper.vm.handleChartMouseMove({
            clientX: 300,
            clientY: 100
        });

        expect(wrapper.vm.hoveredPoint).to.not.be.null;
        expect(wrapper.vm.indicatorSource.getFeatures()).to.have.lengthOf(1);

        // Simulate mouse leave
        wrapper.vm.handleChartMouseLeave();

        expect(wrapper.vm.hoveredPoint).to.be.null;
        expect(wrapper.vm.indicatorSource.getFeatures()).to.have.lengthOf(0);
    });

    it("resets profile data and starts new drawing session on startNewDrawing", async () => {
        const wrapper = mount(ProfilService, {
            global: {
                mocks: {
                    $t: key => key
                }
            }
        });

        wrapper.vm.profileData = mockProfileData;
        wrapper.vm.drawnCoordsVoibos = [[625919, 483187], [626000, 483250]];
        await wrapper.vm.$nextTick();

        wrapper.vm.startNewDrawing();

        expect(wrapper.vm.profileData).to.be.null;
        expect(wrapper.vm.drawnCoordsVoibos).to.deep.equal([]);
        expect(wrapper.vm.isDrawingActive).to.be.true;
    });

    it("computes voibosWebUrl correctly when profile coordinates exist", async () => {
        const wrapper = mount(ProfilService, {
            global: {
                mocks: {
                    $t: key => key
                }
            }
        });

        expect(wrapper.vm.voibosWebUrl).to.be.null;

        wrapper.vm.drawnCoordsVoibos = [
            [625919.5, 483187.2],
            [626000.1, 483250.3]
        ];
        await wrapper.vm.$nextTick();

        expect(wrapper.vm.voibosWebUrl).to.include("name=profilservice");
        expect(wrapper.vm.voibosWebUrl).to.include("Polygonzug=LINESTRING");
    });
});
