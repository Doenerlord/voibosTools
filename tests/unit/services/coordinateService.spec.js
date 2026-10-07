import {expect} from "chai";
import coordinateService from "../../../services/coordinateService.js";

describe("addons/voibosTools/services/coordinateService.js", () => {
    describe("isValidCoordinate", () => {
        it("returns true for valid coordinate pairs", () => {
            expect(coordinateService.isValidCoordinate([10, 20])).to.be.true;
            expect(coordinateService.isValidCoordinate([0, 0])).to.be.true;
            expect(coordinateService.isValidCoordinate([1822717.38, 6141562.34])).to.be.true;
        });

        it("returns false for invalid coordinate pairs", () => {
            expect(coordinateService.isValidCoordinate(null)).to.be.false;
            expect(coordinateService.isValidCoordinate([])).to.be.false;
            expect(coordinateService.isValidCoordinate([10])).to.be.false;
            expect(coordinateService.isValidCoordinate(["10", "20"])).to.be.false;
            expect(coordinateService.isValidCoordinate([NaN, 20])).to.be.false;
        });
    });

    describe("formatCoordinate", () => {
        it("formats coordinate numbers with specified decimals", () => {
            expect(coordinateService.formatCoordinate([12.3456, 78.9101], 2)).to.equal("12.35, 78.91");
            expect(coordinateService.formatCoordinate([12.3456, 78.9101], 0)).to.equal("12, 79");
        });

        it("returns empty string for invalid coordinate", () => {
            expect(coordinateService.formatCoordinate(null)).to.equal("");
        });
    });

    describe("transform", () => {
        it("returns same coordinates when sourceCrs equals targetCrs", () => {
            const coord = [1000, 2000];
            const result = coordinateService.transform(coord, "EPSG:3857", "EPSG:3857");

            expect(result).to.deep.equal([1000, 2000]);
        });

        it("transforms coordinates between EPSG:4326 and EPSG:3857", () => {
            const wgsCoord = [0, 0];
            const mercCoord = coordinateService.transform(wgsCoord, "EPSG:4326", "EPSG:3857");

            expect(mercCoord).to.be.an("array");
            expect(mercCoord[0]).to.be.closeTo(0, 0.001);
            expect(mercCoord[1]).to.be.closeTo(0, 0.001);
        });

        it("returns null for invalid source coordinate", () => {
            expect(coordinateService.transform(null, "EPSG:3857", "EPSG:4326")).to.be.null;
        });
    });

    describe("transformCoordinatesChain", () => {
        it("transforms an array of coordinates", () => {
            const chain = [[0, 0], [10, 10]];
            const result = coordinateService.transformCoordinatesChain(chain, "EPSG:4326", "EPSG:4326");

            expect(result).to.have.lengthOf(2);
            expect(result[0]).to.deep.equal([0, 0]);
            expect(result[1]).to.deep.equal([10, 10]);
        });
    });
});
