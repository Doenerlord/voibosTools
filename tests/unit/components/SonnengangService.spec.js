import {expect} from "chai";
import sinon from "sinon";
import {mount} from "@vue/test-utils";
import mapCollection from "@core/maps/js/mapCollection.js";
import SonnengangService from "../../../components/SonnengangService.vue";
import voibosApi from "../../../services/voibosApi.js";
import coordinateService from "../../../services/coordinateService.js";

describe("addons/voibosTools/components/SonnengangService.vue", () => {
    let mockMap,
        layersArray,
        fetchSunPositionStub,
        fetchSunGraphicsStub,
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

        sinon.stub(mapCollection, "getMap").callsFake(mode => mode === "2D" ? mockMap : null);
        fetchSunPositionStub = sinon.stub(voibosApi, "fetchSunPosition");
        fetchSunGraphicsStub = sinon.stub(voibosApi, "fetchSunGraphics").resolves({
            panorama: "data:image/png;base64,mockPanorama",
            months: "data:image/png;base64,mockMonths",
            distance: null
        });
        transformStub = sinon.stub(coordinateService, "transform").callsFake((coord) => coord);
    });

    afterEach(() => {
        sinon.restore();
    });

    it("registers singleclick listener and adds vector layer on mount", () => {
        const wrapper = mount(SonnengangService, {
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

    it("initializes with today's date and current time", () => {
        const wrapper = mount(SonnengangService, {
            global: {
                mocks: {
                    $t: key => key
                }
            }
        });

        expect(wrapper.vm.selectedDate).to.match(/^\d{4}-\d{2}-\d{2}$/);
        expect(wrapper.vm.selectedTime).to.match(/^\d{2}:\d{2}$/);
    });

    it("removes singleclick listener and layer on unmount", () => {
        const wrapper = mount(SonnengangService, {
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

    it("handles map click, creates marker, and displays sun calculation results", async () => {
        const mockApiResponse = {
            abfragestatus: "erfolgreich",
            datengrundlage: "DSM 2025",
            flugjahr: "2023",
            horizont: [
                {
                    azimuth: 90,
                    hoehenwinkelAbfragedatum: "1.0",
                    hoehenwinkelDSM: "3.0",
                    hoehenwinkelDTM: "1.0",
                    UhrzeitSonnengangMESZ: "05:30",
                    UhrzeitSonnengangMEZ: "04:30"
                },
                {
                    azimuth: 180,
                    hoehenwinkelAbfragedatum: "61.5",
                    hoehenwinkelDSM: "12.0",
                    hoehenwinkelDTM: "2.0",
                    UhrzeitSonnengangMESZ: "13:15",
                    UhrzeitSonnengangMEZ: "12:15"
                },
                {
                    azimuth: 270,
                    hoehenwinkelAbfragedatum: "2.0",
                    hoehenwinkelDSM: "5.0",
                    hoehenwinkelDTM: "2.0",
                    UhrzeitSonnengangMESZ: "21:00",
                    UhrzeitSonnengangMEZ: "20:00"
                }
            ]
        };

        fetchSunPositionStub.resolves(mockApiResponse);

        const wrapper = mount(SonnengangService, {
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

        // Marker created
        expect(wrapper.vm.vectorSource.getFeatures()).to.have.lengthOf(1);
        expect(transformStub.calledOnce).to.be.true;
        expect(fetchSunPositionStub.calledOnce).to.be.true;
        expect(fetchSunGraphicsStub.calledOnce).to.be.true;

        // Result displayed
        expect(wrapper.find(".sun-result-container").exists()).to.be.true;
        expect(wrapper.vm.sunResult).to.not.be.null;
        expect(wrapper.vm.sunResult.sunrise.time).to.equal("05:30");
        expect(wrapper.vm.sunResult.sunset.time).to.equal("21:00");
    });

    it("recalculates when date or time changes if point is already set", async () => {
        fetchSunPositionStub.resolves({
            abfragestatus: "erfolgreich",
            horizont: []
        });

        const wrapper = mount(SonnengangService, {
            global: {
                mocks: {
                    $t: key => key
                }
            }
        });

        // Click point first
        await wrapper.vm.handleMapClick({coordinate: [1000, 2000]});
        expect(fetchSunPositionStub.callCount).to.equal(1);

        // Change date
        wrapper.vm.selectedDate = "2026-12-21";
        await wrapper.vm.onDateTimeChange();

        expect(fetchSunPositionStub.callCount).to.equal(2);
        expect(fetchSunPositionStub.secondCall.args[0].date).to.equal("2026-12-21");
    });

    it("displays error message if coordinate is outside Austria", async () => {
        fetchSunPositionStub.resolves({
            abfragestatus: "Die Abfrage-Koordinaten befinden sich nicht in Österreich.",
            horizont: []
        });

        const wrapper = mount(SonnengangService, {
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

    it("resets coordinates and marker correctly", async () => {
        fetchSunPositionStub.resolves({
            abfragestatus: "erfolgreich",
            horizont: []
        });

        const wrapper = mount(SonnengangService, {
            global: {
                mocks: {
                    $t: key => key
                }
            }
        });

        await wrapper.vm.handleMapClick({coordinate: [1000, 2000]});
        expect(wrapper.vm.vectorSource.getFeatures()).to.have.lengthOf(1);

        wrapper.vm.reset();

        expect(wrapper.vm.sunResult).to.be.null;
        expect(wrapper.vm.clickedCoordVoibos).to.be.null;
        expect(wrapper.vm.vectorSource.getFeatures()).to.have.lengthOf(0);
    });

    it("calculates compass cardinal directions correctly", () => {
        const wrapper = mount(SonnengangService, {
            global: {
                mocks: {
                    $t: key => key
                }
            }
        });

        expect(wrapper.vm.getCompassDirection(0)).to.equal("N");
        expect(wrapper.vm.getCompassDirection(90)).to.equal("O");
        expect(wrapper.vm.getCompassDirection(180)).to.equal("S");
        expect(wrapper.vm.getCompassDirection(270)).to.equal("W");
    });

    it("computes voibosWebUrl and renders link to Voibos when coordinates are set", async () => {
        fetchSunPositionStub.resolves({
            abfragestatus: "erfolgreich",
            horizont: []
        });

        const wrapper = mount(SonnengangService, {
            global: {
                mocks: {
                    $t: key => key
                }
            }
        });

        expect(wrapper.vm.voibosWebUrl).to.be.null;

        await wrapper.vm.handleMapClick({coordinate: [625919.53, 483187.24]});
        await wrapper.vm.$nextTick();

        expect(wrapper.vm.voibosWebUrl).to.not.be.null;
        expect(wrapper.vm.voibosWebUrl).to.include("name=sonnengang");
        expect(wrapper.vm.voibosWebUrl).to.include("Koordinate=625919.53%2C483187.24");

        const voibosLink = wrapper.find("a[href*='voibos']");

        expect(voibosLink.exists()).to.be.true;
        expect(voibosLink.attributes("target")).to.equal("_blank");
    });

    it("switches activeGraphicTab when buttons are clicked", async () => {
        fetchSunPositionStub.resolves({
            abfragestatus: "erfolgreich",
            horizont: []
        });

        const wrapper = mount(SonnengangService, {
            global: {
                mocks: {
                    $t: key => key
                }
            }
        });

        await wrapper.vm.handleMapClick({coordinate: [1000, 2000]});
        await wrapper.vm.$nextTick();

        expect(wrapper.vm.activeGraphicTab).to.equal("panorama");

        wrapper.vm.activeGraphicTab = "months";
        await wrapper.vm.$nextTick();
        expect(wrapper.vm.activeGraphicTab).to.equal("months");

        wrapper.vm.activeGraphicTab = "distance";
        await wrapper.vm.$nextTick();
        expect(wrapper.vm.activeGraphicTab).to.equal("distance");
    });

    it("opens and closes lightbox modal for graphics", async () => {
        const wrapper = mount(SonnengangService, {
            global: {
                mocks: {
                    $t: key => key
                }
            }
        });

        expect(wrapper.vm.selectedModalImage).to.be.null;
        expect(wrapper.find(".voibos-modal-backdrop").exists()).to.be.false;

        wrapper.vm.openImageModal("data:image/png;base64,sample123", "Test Graphic");
        await wrapper.vm.$nextTick();

        expect(wrapper.vm.selectedModalImage).to.equal("data:image/png;base64,sample123");
        expect(wrapper.vm.selectedModalTitle).to.equal("Test Graphic");
        expect(wrapper.find(".voibos-modal-backdrop").exists()).to.be.true;

        wrapper.vm.closeImageModal();
        await wrapper.vm.$nextTick();

        expect(wrapper.vm.selectedModalImage).to.be.null;
        expect(wrapper.find(".voibos-modal-backdrop").exists()).to.be.false;
    });
});
