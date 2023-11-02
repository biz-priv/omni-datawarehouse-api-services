const AWS = require("aws-sdk");
const dynamodb = new AWS.DynamoDB.DocumentClient();
const { v4: uuidv4 } = require("uuid");
const momentTZ = require("moment-timezone");
const { get } = require("lodash");

let itemObj = {
    id: uuidv4().toString(),
    housebill: "",
    filleNumber: "",
    createdAt: momentTZ.tz("America/Chicago").format("YYYY-MM-DD HH:mm:ss").toString(),
    eventBody: "",
    xmlRequestPayload: "",
    xmlResponsePayload: "",
    errorMsg: "",
    status: "",
    version: "v2",
}

module.exports.handler = async (event) => {
    console.info("event", JSON.stringify(event));

    try {

        const body = get(event, "body", {});
        itemObj.eventBody = body;

        if (get(event, "enhancedAuthContext.customerId", null) === "7L") {
            if (get(body, "vendorInvoiceRequest", null) === null) {
                itemObj.errorMsg = "Given input body requires vendorInvoiceRequest data.";
            } else {
                if (get(body, "vendorInvoiceRequest.housebill", null) === null && get(body, "vendorInvoiceRequest.fileNumber", null) === null) {
                    itemObj.errorMsg = "housebill or fileNumber is required in vendorInvoiceRequest.";
                } else if (get(body, "vendorInvoiceRequest.vendorReference", null) === null) {
                    itemObj.errorMsg = "vendorReference is required in vendorInvoiceRequest.";
                } else if (get(body, "vendorInvoiceRequest.vendorId", null) === null) {
                    itemObj.errorMsg = "vendorId is required in vendorInvoiceRequest.";
                }
            }
        }else{
            itemObj.errorMsg = "Unauthorized request."
        }

        if (get(itemObj, "errorMsg", null === null)) {
            // await putItem(ADD_MILESTONE_LOGS_TABLE, itemObj);  create dynamodb from terraform
            return { statusCode: 400, message: itemObj.errorMsg };
        }

        // const request = connectToSQLServer()
        // const result = await request.query('SELECT * FROM YourTableName');
        // console.log('Query result:', result.recordset);

        // sql.close();
        // console.log('Connection closed');
        return { id: itemObj.id, message: "success" };

    } catch (error) {
        console.error("Main lambda error: ", error)
        let errorMsgVal = ""
        if (get(error, "message", null) === null) {
            errorMsgVal = get(error, "message", "");
        } else {
            errorMsgVal = error;
        }
        itemObj.errorMsg = errorMsgVal;
        // await putItem(ADD_MILESTONE_LOGS_TABLE, itemObj);
        return { statusCode: 400, message: errorMsgVal };
    }

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

async function connectToSQLServer() {
    const config = {
        user: 'your_username',
        password: 'your_password',
        server: 'your_server_address',
        port: 12345,
        database: 'your_database_name',
    };

    try {
        await sql.connect(config);
        console.log('Connected to SQL Server');
        const request = new sql.Request();
        return request;

    } catch (err) {
        console.error('Error:', err);
    }
}