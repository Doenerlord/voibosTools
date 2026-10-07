import {expect} from "chai";
import sinon from "sinon";
import voibosApi from "../../../services/voibosApi.js";

describe("addons/voibosTools/services/voibosApi.js", () => {
    let requestStub;

    beforeEach(() => {
        requestStub = sinon.stub(voibosApi, "request");
    });

    afterEach(() => {
        requestStub.restore();
    });

    describe("fetchElevation", () => {
        it("throws an error when coordinate is missing", async () => {
            try {
                await voibosApi.fetchElevation({});
                expect.fail("Should have thrown an error");
            }
            catch (error) {
                expect(error.message).to.include("Coordinate (x, y) is required");
            }
        });

        it("calls GET with correct query parameters when given [x, y]", async () => {
            const mockResponse = {
                abfragestatus: "erfolgreich",
                hoeheDTM: 172.1,
                hoeheDSM: 197.9,
                deltaH: 25.8
            };

            requestStub.resolves(mockResponse);

            const result = await voibosApi.fetchElevation({
                coordinate: [625919.53, 483187.24],
                crs: "EPSG:31287"
            });

            expect(requestStub.calledOnce).to.be.true;

            const [endpoint, config] = requestStub.firstCall.args;

            expect(endpoint).to.equal("");
            expect(config.method).to.equal("GET");
            expect(config.params).to.deep.equal({
                name: "hoehenservice",
                Koordinate: "625919.53,483187.24",
                CRS: "31287"
            });
            expect(result).to.deep.equal(mockResponse);
        });

        it("strips EPSG: prefix from crs code", async () => {
            requestStub.resolves({abfragestatus: "erfolgreich"});

            await voibosApi.fetchElevation({
                x: 100,
                y: 200,
                crs: "EPSG:31256"
            });

            const config = requestStub.firstCall.args[1];

            expect(config.params.CRS).to.equal("31256");
        });
    });
});
