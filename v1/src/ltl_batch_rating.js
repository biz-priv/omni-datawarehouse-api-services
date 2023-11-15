const fs = require("fs");
const { get } = require("lodash");
const xlsx = require("xlsx");

module.exports.handler = async (event, context) => {
    try {
        let body;
        body = get(event, "body");
        if (typeof body === "string") body = JSON.parse(body);
        const fileBase64 = get(body, "file");
        const filePath = "/tmp/output.xslx";
        const file = base64ToXlsx(fileBase64, filePath);
        const isXlsx = isValidXlsx(file);
        if (!isXlsx) throw new Error("Invalid file");
        console.log(`🙂 -> file: ltl_batch_rating.js:10 -> isXlsx:`, isXlsx);
        const response = {
            statusCode: 200,
            body: JSON.stringify({
                message: "CSV file uploaded successfully!",
                input: isXlsx,
            }),
        };
        return response;
    } catch (error) {
        console.log(`🙂 -> file: ltl_batch_rating.js:18 -> error:`, error);
        throw new Error(error.message);
    }
};

function base64ToXlsx(base64String, filePath) {
    const buffer = Buffer.from(base64String, "base64");
    fs.writeFileSync(filePath, buffer);
    console.log(`XLSX file created at: ${filePath}`);
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
