const AWS = require("aws-sdk");
const dynamodb = new AWS.DynamoDB.DocumentClient();
const { v4: uuidv4 } = require("uuid");
const momentTZ = require("moment-timezone");
const { get } = require("lodash");
const sql = require('mssql');

let itemObj = {
    id: uuidv4().toString(),
    housebill: "",
    fileNumber: "",
    vendorId: "",
    vendorReference: "",
    createdAt: momentTZ.tz("America/Chicago").format("YYYY-MM-DD HH:mm:ss").toString(),
    eventBody: {},
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
                throw new Error({ message: "Given input body requires vendorInvoiceRequest data." });
            } else {
                if (get(body, "vendorInvoiceRequest.housebill", null) === null && get(body, "vendorInvoiceRequest.fileNumber", null) === null) {
                    throw new Error({ message: "housebill or fileNumber is required in vendorInvoiceRequest." });
                } else if (get(body, "vendorInvoiceRequest.vendorReference", null) === null) {
                    throw new Error({ message: "vendorReference is required in vendorInvoiceRequest." });
                } else if (get(body, "vendorInvoiceRequest.vendorId", null) === null) {
                    throw new Error({ message: "vendorId is required in vendorInvoiceRequest." });
                }
            }
        } else {
            throw new Error({ message: "Unauthorized request." });
        }

        let getQuery;
        itemObj.vendorId = get(body, "vendorInvoiceRequest.vendorId", null)
        itemObj.vendorReference = get(body, "vendorInvoiceRequest.vendorReference", null)
        if (get(body, "vendorInvoiceRequest.fileNumber", null) !== null) {
            itemObj.fileNumber = get(body, "vendorInvoiceRequest.fileNumber", null)
            getQuery = `select * from tbl_shipmentapar where fk_orderno='${get(body, "vendorInvoiceRequest.fileNumber", null)}' and fk_vendorid='${get(body, "vendorInvoiceRequest.vendorId", null)}' and finalize<>'Y'`
        } else {
            itemObj.housebill = get(body, "vendorInvoiceRequest.housebill", null)
            getQuery = `select * from tbl_ShipmentHeader a join tbl_shipmentapar b on a.PK_Orderno=b.FK_OrderNo where a.Housebill='${get(body, "vendorInvoiceRequest.housebill", null)}' and b.FK_VendorId='${get(body, "vendorInvoiceRequest.vendorId", null)}' and b.Finalize<>'Y'`
        }

        console.info("getQuery: ", getQuery);
        const request = await connectToSQLServer();
        const result = await request.query(getQuery);
        console.info("No. of records: ", get(result, "recordset", []), "No of records: ", get(result, "recordset", []).length)

        if (get(result, "recordset", []).length === 0 || get(result, "recordset", []).length > 2) {
            throw new Error({ message: "0 rows updated" });
        }
        const fileNumber = get(result, "recordset[0].FK_OrderNo", "")
        let updateQuery = `update dbo.tbl_shipmentapar set refno='${get(body, "vendorInvoiceRequest.vendorReference", null)}' where fk_orderno='${fileNumber}' and fk_vendorid='${get(body, "vendorInvoiceRequest.vendorId", null)}' and finalize<>'Y'`
        console.log("updateQuery: ", updateQuery)

        await request.query(updateQuery);

        sql.close();
        console.log('Connection closed');
        itemObj.status = "SUCCESS"
        await putItem(itemObj);
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
        itemObj.status = "FAILED";
        await putItem(itemObj);
        return { statusCode: 400, message: errorMsgVal };
    }
}


async function putItem(item) {
    try {
        let params = {
            TableName: process.env.LOGS_TABLE,
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
        user: process.env.DB_USERNAME,
        password: process.env.DB_PASSWORD,
        server: process.env.DB_SERVER,
        port: parseInt(process.env.DB_PORT),
        database: process.env.DB_DATABASE,
        options: {
            trustServerCertificate: true, // For self-signed certificates (optional)
        },
    };

    try {
        console.log("config: ", config)
        await sql.connect(config);
        console.log('Connected to SQL Server');
        const request = new sql.Request();
        return request;

    } catch (err) {
        console.error('Error: ', err);
        throw err;
    }
}