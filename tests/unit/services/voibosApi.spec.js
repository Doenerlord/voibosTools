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

    describe("fetchSunPosition", () => {
        it("throws an error when coordinate is missing", async () => {
            try {
                await voibosApi.fetchSunPosition({});
                expect.fail("Should have thrown an error");
            }
            catch (error) {
                expect(error.message).to.include("Coordinate (x, y) is required");
            }
        });

        it("calls GET with correct query parameters including formatted Datum and JSONDownload", async () => {
            const mockResponse = {
                abfragestatus: "erfolgreich",
                horizont: []
            };

            requestStub.resolves(mockResponse);

            const result = await voibosApi.fetchSunPosition({
                coordinate: [625919.53, 483187.24],
                crs: "EPSG:31287",
                date: "2026-06-21",
                time: "14:30",
                height: 2.5
            });

            expect(requestStub.calledOnce).to.be.true;

            const [endpoint, config] = requestStub.firstCall.args;

            expect(endpoint).to.equal("");
            expect(config.method).to.equal("GET");
            expect(config.params).to.deep.equal({
                name: "sonnengang",
                Koordinate: "625919.53,483187.24",
                CRS: "31287",
                output: "JSONDownload",
                Datum: "06-21-14:30",
                H: "2.5"
            });
            expect(result).to.deep.equal(mockResponse);
        });

        it("accepts a Date object for date parameter", async () => {
            requestStub.resolves({abfragestatus: "erfolgreich"});

            const testDate = new Date(2026, 9, 7, 10, 15); // month 9 = October

            await voibosApi.fetchSunPosition({
                x: 100,
                y: 200,
                date: testDate,
                time: "10:15"
            });

            const config = requestStub.firstCall.args[1];

            expect(config.params.Datum).to.equal("10-07-10:15");
        });
    });

    describe("parseSunData", () => {
        it("returns null when response is invalid or missing horizont", () => {
            expect(voibosApi.parseSunData(null)).to.be.null;
            expect(voibosApi.parseSunData({})).to.be.null;
            expect(voibosApi.parseSunData({horizont: "not-an-array"})).to.be.null;
        });

        it("parses sunrise, sunset, solar noon, and current sun position", () => {
            const sampleResponse = {
                abfragestatus: "erfolgreich",
                datengrundlage: "DSM 2025",
                flugjahr: "2023",
                "sonnenstunden pro tag im monatsmittel": {
                    Januar: 2.1,
                    Juni: 9.8
                },
                horizont: [
                    {
                        azimuth: 60,
                        hoehenwinkelAbfragedatum: "-5.0",
                        hoehenwinkelDSM: "3.0",
                        hoehenwinkelDTM: "1.0",
                        UhrzeitSonnengangMESZ: "05:00",
                        UhrzeitSonnengangMEZ: "04:00"
                    },
                    {
                        azimuth: 90,
                        hoehenwinkelAbfragedatum: "5.2",
                        hoehenwinkelDSM: "3.5",
                        hoehenwinkelDTM: "1.2",
                        UhrzeitSonnengangMESZ: "06:15",
                        UhrzeitSonnengangMEZ: "05:15"
                    },
                    {
                        azimuth: 180,
                        hoehenwinkelAbfragedatum: "62.4",
                        hoehenwinkelDSM: "12.0",
                        hoehenwinkelDTM: "2.5",
                        UhrzeitSonnengangMESZ: "13:00",
                        UhrzeitSonnengangMEZ: "12:00"
                    },
                    {
                        azimuth: 270,
                        hoehenwinkelAbfragedatum: "4.8",
                        hoehenwinkelDSM: "8.0",
                        hoehenwinkelDTM: "4.0",
                        UhrzeitSonnengangMESZ: "20:45",
                        UhrzeitSonnengangMEZ: "19:45"
                    },
                    {
                        azimuth: 300,
                        hoehenwinkelAbfragedatum: "-4.0",
                        hoehenwinkelDSM: "2.0",
                        hoehenwinkelDTM: "1.0",
                        UhrzeitSonnengangMESZ: "21:30",
                        UhrzeitSonnengangMEZ: "20:30"
                    }
                ]
            };

            const parsed = voibosApi.parseSunData(sampleResponse, "13:00", true);

            expect(parsed).to.not.be.null;
            expect(parsed.timeZoneSuffix).to.equal("MESZ");

            // Sunrise & Sunset
            expect(parsed.sunrise.time).to.equal("06:15");
            expect(parsed.sunrise.azimuth).to.equal(90);
            expect(parsed.sunset.time).to.equal("20:45");
            expect(parsed.sunset.azimuth).to.equal(270);

            // Solar Noon
            expect(parsed.solarNoon.time).to.equal("13:00");
            expect(parsed.solarNoon.maxElevation).to.equal(62.4);

            // Current position at 13:00 (MESZ)
            expect(parsed.currentPosition.azimuth).to.equal(180);
            expect(parsed.currentPosition.elevation).to.equal(62.4);
            expect(parsed.currentPosition.isAboveHorizon).to.be.true;
            expect(parsed.currentPosition.isDirectSun).to.be.true; // 62.4 > 12.0 (DSM)
        });

        it("detects shade when elevation is below DSM horizon", () => {
            const sampleResponse = {
                abfragestatus: "erfolgreich",
                horizont: [
                    {
                        azimuth: 270,
                        hoehenwinkelAbfragedatum: "4.8",
                        hoehenwinkelDSM: "8.0", // obstruction higher than sun elevation
                        hoehenwinkelDTM: "2.0",
                        UhrzeitSonnengangMESZ: "20:45",
                        UhrzeitSonnengangMEZ: "19:45"
                    }
                ]
            };

            const parsed = voibosApi.parseSunData(sampleResponse, "20:45", true);

            expect(parsed.currentPosition.isAboveHorizon).to.be.true;
            expect(parsed.currentPosition.isDirectSun).to.be.false;
        });

        it("supports standard time (MEZ) mode", () => {
            const sampleResponse = {
                abfragestatus: "erfolgreich",
                horizont: [
                    {
                        azimuth: 180,
                        hoehenwinkelAbfragedatum: "25.0",
                        hoehenwinkelDSM: "5.0",
                        hoehenwinkelDTM: "2.0",
                        UhrzeitSonnengangMESZ: "13:00",
                        UhrzeitSonnengangMEZ: "12:00"
                    }
                ]
            };

            const parsed = voibosApi.parseSunData(sampleResponse, "12:00", false);

            expect(parsed.timeZoneSuffix).to.equal("MEZ");
            expect(parsed.solarNoon.time).to.equal("12:00");
            expect(parsed.currentPosition.time).to.equal("12:00");
        });
    });

    describe("buildVoibosUrl", () => {
        it("constructs full Voibos URL with query params", () => {
            const url = voibosApi.buildVoibosUrl("sonnengang", {
                coordinate: [625919.53, 483187.24],
                crs: "EPSG:31287",
                date: "2026-06-21",
                time: "14:30",
                height: 2.0
            });

            expect(url).to.include("name=sonnengang");
            expect(url).to.include("Koordinate=625919.53%2C483187.24");
            expect(url).to.include("CRS=31287");
            expect(url).to.include("Datum=06-21-14%3A30");
            expect(url).to.include("H=2");
        });

        it("works with x and y properties", () => {
            const url = voibosApi.buildVoibosUrl("hoehenservice", {
                x: 100,
                y: 200,
                crs: "31287"
            });

            expect(url).to.include("name=hoehenservice");
            expect(url).to.include("Koordinate=100%2C200");
            expect(url).to.include("CRS=31287");
        });

        it("constructs Voibos URL for profilservice with LINESTRING WKT", () => {
            const url = voibosApi.buildVoibosUrl("profilservice", {
                coordinates: [
                    [625919.53, 483187.24],
                    [626000.12, 483250.34]
                ],
                crs: "31287",
                stepDistance: 15,
                exaggeration: 2
            });

            expect(url).to.include("name=profilservice");
            expect(url).to.include("Polygonzug=LINESTRING%28625919.53+483187.24%2C+626000.12+483250.34%29");
            expect(url).to.include("Stuetzpunktabstand=15");
            expect(url).to.include("Beschriftung=ja");
            expect(url).to.include("Ueberhoehung=2");
        });
    });

    describe("extractSunGraphicsFromHtml", () => {
        it("returns object with nulls for invalid input", () => {
            expect(voibosApi.extractSunGraphicsFromHtml(null)).to.deep.equal({
                panorama: null,
                months: null,
                distance: null
            });
            expect(voibosApi.extractSunGraphicsFromHtml("")).to.deep.equal({
                panorama: null,
                months: null,
                distance: null
            });
        });

        it("extracts panorama, months, and distance images from HTML", () => {
            const fakeBase64 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
            const html = `
                <div>
                    <img id="panorama" src="${fakeBase64}" />
                    <img id="months" src="${fakeBase64}" />
                    <img id="distance" src="${fakeBase64}" />
                </div>
            `;

            const graphics = voibosApi.extractSunGraphicsFromHtml(html);

            expect(graphics.panorama).to.equal(fakeBase64);
            expect(graphics.months).to.equal(fakeBase64);
            expect(graphics.distance).to.equal(fakeBase64);
        });

        it("cleans line breaks inside base64 strings", () => {
            const base64WithNewlines = "data:image/png;base64,iVBORw0KGgoAAAANSU\nhEUgAAAAEAAAABCAYAAAA\nfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
            const html = `<img id="panorama" src="${base64WithNewlines}" />`;

            const graphics = voibosApi.extractSunGraphicsFromHtml(html);

            expect(graphics.panorama).to.not.include("\n");
            expect(graphics.panorama).to.include("data:image/png;base64,");
        });
    });

    describe("fetchSunGraphics", () => {
        it("throws error when coordinate is missing", async () => {
            try {
                await voibosApi.fetchSunGraphics({});
                expect.fail("Should have thrown error");
            }
            catch (error) {
                expect(error.message).to.include("Coordinate (x, y) is required");
            }
        });

        it("calls GET with Output=Horizont,Sonnenzeit,Lage and extracts graphics", async () => {
            const fakeBase64 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
            const mockHtml = `<img id="panorama" src="${fakeBase64}" /><img id="months" src="${fakeBase64}" />`;

            requestStub.resolves(mockHtml);

            const result = await voibosApi.fetchSunGraphics({
                coordinate: [625919.53, 483187.24],
                crs: "31287",
                date: "2026-06-21",
                time: "14:30"
            });

            expect(requestStub.calledOnce).to.be.true;

            const config = requestStub.firstCall.args[1];

            expect(config.params.Output).to.equal("Horizont,Sonnenzeit,Lage");
            expect(result.panorama).to.equal(fakeBase64);
            expect(result.months).to.equal(fakeBase64);
            expect(result.distance).to.be.null;
        });
    });

    describe("fetchProfile", () => {
        it("throws an error when coordinates array has less than 2 coordinates", async () => {
            try {
                await voibosApi.fetchProfile({coordinates: [[1, 2]]});
                expect.fail("Should have thrown error");
            }
            catch (error) {
                expect(error.message).to.include("At least 2 coordinates");
            }
        });

        it("calls GET with correct query parameters including LINESTRING WKT and JSONDownload", async () => {
            const mockResponse = {
                abfragestatus: "erfolgreich",
                stuetzpunkte: []
            };

            requestStub.resolves(mockResponse);

            const result = await voibosApi.fetchProfile({
                coordinates: [
                    [625919.53, 483187.24],
                    [626000.12, 483250.34]
                ],
                crs: "EPSG:31287",
                stepDistance: 10,
                exaggeration: 1
            });

            expect(requestStub.calledOnce).to.be.true;

            const [endpoint, config] = requestStub.firstCall.args;

            expect(endpoint).to.equal("");
            expect(config.method).to.equal("GET");
            expect(config.params).to.deep.equal({
                name: "profilservice",
                Polygonzug: "LINESTRING(625919.53 483187.24, 626000.12 483250.34)",
                CRS: "31287",
                Stuetzpunktabstand: "10",
                Beschriftung: "ja",
                Ueberhoehung: "1",
                output: "JSONDownload"
            });
            expect(result).to.deep.equal(mockResponse);
        });
    });

    describe("parseProfileData", () => {
        it("returns null when response is invalid or missing stuetzpunkte", () => {
            expect(voibosApi.parseProfileData(null)).to.be.null;
            expect(voibosApi.parseProfileData({})).to.be.null;
            expect(voibosApi.parseProfileData({stuetzpunkte: []})).to.be.null;
        });

        it("parses points and calculates distances, elevation stats, and gain/loss", () => {
            const mockResponse = {
                stuetzpunkte: [
                    {
                        stuetzpunktnummer: 0,
                        "horizontale distanz": 0,
                        rechtswert: 625919.53,
                        hochwert: 483187.24,
                        hoeheDTM: 200,
                        hoeheDSM: 210,
                        "hoehe sichtlinie": 200,
                        flugjahr: 2020
                    },
                    {
                        stuetzpunktnummer: 1,
                        "horizontale distanz": 50,
                        rechtswert: 625950.0,
                        hochwert: 483200.0,
                        hoeheDTM: 250,
                        hoeheDSM: 255,
                        "hoehe sichtlinie": 210,
                        flugjahr: 2020
                    },
                    {
                        stuetzpunktnummer: 2,
                        "horizontale distanz": 100,
                        rechtswert: 626000.0,
                        hochwert: 483250.0,
                        hoeheDTM: 220,
                        hoeheDSM: 230,
                        "hoehe sichtlinie": 220,
                        flugjahr: 2020
                    }
                ],
                datengrundlage: "ALS DTM/DSM",
                flugjahre: "2020"
            };

            const data = voibosApi.parseProfileData(mockResponse);

            expect(data).to.not.be.null;
            expect(data.points).to.have.lengthOf(3);
            expect(data.totalDistance).to.equal(100);
            expect(data.minDtm).to.equal(200);
            expect(data.maxDtm).to.equal(250);
            expect(data.minDsm).to.equal(210);
            expect(data.maxDsm).to.equal(255);
            expect(data.elevationDifference).to.equal(50);
            expect(data.elevationGain).to.equal(50);
            expect(data.elevationLoss).to.equal(30);
            expect(data.dataSource).to.equal("ALS DTM/DSM");
            expect(data.flightYears).to.equal("2020");
        });
    });
});
