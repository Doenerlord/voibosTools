import {expect} from "chai";
import sinon from "sinon";
import {mount} from "@vue/test-utils";
import mapCollection from "@core/maps/js/mapCollection.js";
import HoehenService from "../../../components/HoehenService.vue";
import voibosApi from "../../../services/voibosApi.js";
import coordinateService from "../../../services/coordinateService.js";

describe("addons/voibosTools/components/HoehenService.vue", () => {
    let mockMap,
        layersArray,
        fetchElevationStub,
        transformStub;

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

        sinon.stub(mapCollection, "getMap").callsFake(mode => (mode === "2D" ? mockMap : null));
        fetchElevationStub = sinon.stub(voibosApi, "fetchElevation");
        transformStub = sinon.stub(coordinateService, "transform").callsFake((coord) => coord);
    });

    afterEach(() => {
        sinon.restore();
    });

    it("registers singleclick listener and adds vector layer on mount", () => {
        const wrapper = mount(HoehenService, {
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

    it("removes singleclick listener and layer on unmount", () => {
        const wrapper = mount(HoehenService, {
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

    it("handles map click, creates marker, and displays elevation results", async () => {
        fetchElevationStub.resolves({
            abfragestatus: "erfolgreich",
            hoeheDTM: 172.1,
            hoeheDSM: 197.9,
            deltaH: 25.8,
            einheit: "Meter über Adria",
            datengrundlage: "Laserscanning 2025",
            flugjahr: "2023",
            abfragekoordinaten: {rechtswert: 625919.5, hochwert: 483187.2, CRS: 31287}
        });

        const wrapper = mount(HoehenService, {
            global: {
                mocks: {
                    $t: key => key
                }
            }
        });

        const clickEvent = {
            coordinate: [1822717.38, 6141562.34]
        };

        await wrapper.vm.handleMapClick(clickEvent);
        await wrapper.vm.$nextTick();

        // Marker added to source
        expect(wrapper.vm.vectorSource.getFeatures()).to.have.lengthOf(1);
        expect(fetchElevationStub.calledOnce).to.be.true;

        // Verify result rendered
        expect(wrapper.find(".elevation-value").text()).to.include("172,1");
        expect(wrapper.text()).to.include("197,9 m");
        expect(wrapper.text()).to.include("25,8 m");
    });

    it("displays error message if coordinate is outside Austria", async () => {
        fetchElevationStub.resolves({
            abfragestatus: "Die Abfrage-Koordinaten befinden sich nicht in Österreich.",
            hoeheDTM: "n/a",
            hoeheDSM: "n/a"
        });

        const wrapper = mount(HoehenService, {
            global: {
                mocks: {
                    $t: key => key
                }
            }
        });

        await wrapper.vm.handleMapClick({coordinate: [0, 0]});
        await wrapper.vm.$nextTick();

        expect(wrapper.find(".alert-warning").exists()).to.be.true;
        expect(wrapper.find(".alert-warning").text()).to.include("Die Abfrage-Koordinaten befinden sich nicht in Österreich.");
    });

    it("clears marker and results when reset is called", async () => {
        fetchElevationStub.resolves({
            abfragestatus: "erfolgreich",
            hoeheDTM: 100
        });

        const wrapper = mount(HoehenService, {
            global: {
                mocks: {
                    $t: key => key
                }
            }
        });

        await wrapper.vm.handleMapClick({coordinate: [1000, 2000]});
        expect(wrapper.vm.vectorSource.getFeatures()).to.have.lengthOf(1);

        wrapper.vm.reset();

        expect(wrapper.vm.elevationData).to.be.null;
        expect(wrapper.vm.vectorSource.getFeatures()).to.have.lengthOf(0);
    });
});
