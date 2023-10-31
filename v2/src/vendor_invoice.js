const AWS = require("aws-sdk");
const dynamodb = new AWS.DynamoDB.DocumentClient();
const { v4: uuidv4 } = require("uuid");
const momentTZ = require("moment-timezone");

const schema = Joi.object({
    housebill: Joi.string(),
    fileNumber: Joi.string(),
}).xor('housebill', 'fileNumber');

let itemObj = {
    id: uuidv4().toString(),
    housebill: "",
    filleNumber: "",
    createdAt: momentTZ.tz("America/Chicago").format("YYYY-MM-DD HH:mm:ss").toString(),
    payload: "",
    xmlRequestPayload: "",
    xmlResponsePayload: "",
    errorMsg: "",
    status: "",
    version: "v2",
}

module.exports.handler = async (event, context, callback) => {
    console.info("event", JSON.stringify(event));

    const body = event.body;
    if (get(body, "vendorInvoiceRequest", null) === null) {
        itemObj.errorMsg = "Given input body requires vendorInvoiceRequest data";
        // await putItem(ADD_MILESTONE_LOGS_TABLE, itemObj);  //create dynamodb from terraform
        // return { statusCode: 400, message: "Given input body requires vendorInvoiceRequest data" };
    } else if (get(body, "vendorInvoiceRequest.housebill", null === null || get(body, "vendorInvoiceRequest.fileNumber", null) === null)) {
        itemObj.errorMsg = "housebill or fileNumber is required in vendorInvoiceRequest";
        // return { statusCode: 400, message: "housebill or fileNumber is required in vendorInvoiceRequest" };
    } else if (get(body, "vendorInvoiceRequest.vendorReference", null) === null) {
        itemObj.errorMsg = "vendorReference is required in vendorInvoiceRequest";
        // return { statusCode: 400, message: "vendorReference is required in vendorInvoiceRequest" };
    } else {
        if (get(body, "enhancedAuthContext.customerId", null) === "7L") {
            if (get(body, "vendorInvoiceRequest.vendorId", null) === null) {
                itemObj.errorMsg = "vendorId is required in vendorInvoiceRequest";
            }
        }
    }

    if(get(itemObj, "errorMsg", null === null)){
        return { statusCode: 400, message: itemObj.errorMsg };
    }


    return { id: itemObj.id, message: "success" };

}


async function putItem(tableName, item) {
    let params;
    try {
        params = {
            TableName: tableName,
            Item: item,
        };
        console.info("Insert Params: ", params)
        return await dynamodb.put(params).promise();
    } catch (e) {
        console.error("Put Item Error: ", e, "\nPut params: ", params);
        throw new Error("PutItemError");
    }
}