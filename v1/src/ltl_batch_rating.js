const fs = require("fs");
const { get } = require("lodash");
const xlsx = require("xlsx");
const { utils } = require("xlsx");
const { putObject } = require("../../src/shared/s3");
const moment = require("moment-timezone");

module.exports.handler = async (event, context, callback) => {
    try {
        let body;
        console.info(`🙂 -> file: ltl_batch_rating.js:6 -> event:`, event);
        body = get(event, "body", "");
        const dateTimeNow = moment().tz("America/Chicago").format("YYYY-MM-DD_HH-mm-ss");
        // if (typeof body === "string") body = JSON.parse(body);
        const fileBase64 = get(body, "data");
        console.info(`🙂 -> file: ltl_batch_rating.js:11 -> fileBase64:`, fileBase64);
        const filePath = "/tmp/output.xslx";
        base64ToXlsx(fileBase64, filePath);
        await putObject(fs.createReadStream(filePath), `upload/${dateTimeNow}`, "omni-dw-api-services-ltl-batch-rating-bucket-dev", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        // const isXlsx = isValidXlsx(filePath);
        // if (!isXlsx) throw new Error("Invalid file");
        // console.log(`🙂 -> file: ltl_batch_rating.js:10 -> isXlsx:`, isXlsx);
        // const Loads = get(isXlsx.Sheets, "Loads", false);
        // if (!Loads) throw new Error("Sheet 'Loads' is not present");
        // const toJSON = utils.sheet_to_json(Loads);
        // console.info(`🙂 -> file: excelTest.js:5 -> workbook:`, toJSON);
        // const ltlOnly = toJSON.filter((item) => get(item, "LTL", false));
        // const response = {
        //     statusCode: 200,
        //     body: JSON.stringify({
        //         message: "File is acknowledged. We will inform you when the rating is done.",
        //     }),
        // };
        return response;
    } catch (error) {
        console.log(`🙂 -> file: ltl_batch_rating.js:18 -> error:`, error);
        throw new Error(error.message);
    }
};

function base64ToXlsx(base64String, filePath) {
    try {
        const buffer = Buffer.from(base64String, "base64");
        fs.writeFileSync(filePath, buffer);
        console.log(`XLSX file created at: ${filePath}`);
    } catch (error) {
        throw new Error(error.message);
    }
}

function isValidXlsx(filePath) {
    try {
        const workbook = xlsx.readFile(filePath);
        return workbook;
    } catch (error) {
        console.error("Error reading XLSX file:", error.message);
        return false;
    }
}
