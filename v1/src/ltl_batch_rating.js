const moment = require("moment-timezone");
const AWS = require("aws-sdk");
const s3 = new AWS.S3();

module.exports.handler = async (event, context, callback) => {
    try {
        const preSignedUrl = await getS3PresignedUrl();
        console.info(`🙂 -> file: ltl_batch_rating.js:29 -> preSignedUrl:`, preSignedUrl);
        if (!preSignedUrl) throw new Error("Could not generate preSignedUrl.");
        const response = {
            statusCode: 200,
            body: JSON.stringify({
                url: preSignedUrl,
            }),
        };
        return response;
    } catch (error) {
        console.log(`🙂 -> file: ltl_batch_rating.js:18 -> error:`, error);
        throw new Error(error.message);
    }
};

async function getS3PresignedUrl() {
    const dateTimeNow = moment().tz("America/Chicago").format("YYYY-MM-DD_HH-mm-ss");
    const params = {
        Bucket: "omni-dw-api-services-ltl-batch-rating-bucket-dev",
        Key: `upload/${dateTimeNow}`,
        Expires: 600,
        ContentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    };
    console.info(`🙂 -> file: ltl_batch_rating.js:69 -> params:`, params);
    try {
        return await s3.getSignedUrlPromise("putObject", params);
    } catch (error) {
        console.error(`🙂 -> file: ltl_batch_rating.js:74 -> error:`, error);
        return false;
    }
}
