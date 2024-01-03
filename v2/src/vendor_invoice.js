const AWS = require("aws-sdk");
const dynamodb = new AWS.DynamoDB.DocumentClient();
const { v4: uuidv4 } = require("uuid");
const momentTZ = require("moment-timezone");
const { get } = require("lodash");
const sql = require("mssql");
const sns = new AWS.SNS();
const Joi = require("joi");

const eventValidation = Joi.object({
  vendorInvoiceRequest: Joi.object({
    housebill: Joi.string(),
    fileNumber: Joi.string(),
    vendorReference: Joi.string().required(),
    vendorId: Joi.string().required(),
    chargeList: Joi.array().items(Joi.object({
      code: Joi.string().required(),
      description: Joi.string(),
      charge: Joi.number().required()
    }))
  }).xor('housebill', 'fileNumber')
});

const columnFromCode = {
  FRT: "cost",
  FSC: "extra",
  TAX: "tax",
  default: "total"
}

let itemObj = {
  id: uuidv4().toString(),
  housebill: "",
  fileNumber: "",
  vendorId: "",
  vendorReference: "",
  createdAt: momentTZ.tz("America/Chicago").format("YYYY-MM-DD HH:mm:ss"),
  eventBody: {},
  errorMsg: "",
  status: "",
  version: "v2",
};

module.exports.handler = async (event, context, callback) => {
  console.info("event", JSON.stringify(event));

  try {
    const body = get(event, "body", {});
    itemObj.eventBody = body;
    const { error, value } = eventValidation.validate(body);
    if(error){
      console.log("Error: ", error);
      throw new Error(`Error,${error}`);
    }

    let getQuery;
    itemObj.vendorId = get(body, "vendorInvoiceRequest.vendorId", null);
    itemObj.vendorReference = get(
      body,
      "vendorInvoiceRequest.vendorReference",
      null
    );
    if (get(body, "vendorInvoiceRequest.fileNumber", null) !== null) {
      itemObj.fileNumber = get(body, "vendorInvoiceRequest.fileNumber", null);
      getQuery = `select FK_OrderNo from dbo.tbl_shipmentapar where fk_orderno='${get(
        body,
        "vendorInvoiceRequest.fileNumber",
        null
      )}' and fk_vendorid='${get(
        body,
        "vendorInvoiceRequest.vendorId",
        null
      )}' and finalize<>'Y'`;
    } else {
      itemObj.housebill = get(body, "vendorInvoiceRequest.housebill", null);
      getQuery = `select b.FK_OrderNo from dbo.tbl_ShipmentHeader a join dbo.tbl_shipmentapar b on a.PK_Orderno=b.FK_OrderNo where a.Housebill='${get(
        body,
        "vendorInvoiceRequest.housebill",
        null
      )}' and b.FK_VendorId='${get(
        body,
        "vendorInvoiceRequest.vendorId",
        null
      )}' and b.Finalize<>'Y'`;
    }

    console.info("getQuery: ", getQuery);
    const request = await connectToSQLServer();
    const result = await request.query(getQuery);
    console.info(
      "No. of records: ",
      get(result, "recordset", []),
      "No of records: ",
      get(result, "recordset", []).length
    );

    if (get(result, "recordset", []).length !== 1) {
      throw new Error("Error,0 rows updated.");
    }
    const fileNumber = get(result, "recordset[0].FK_OrderNo", "");
    let updateQuery = ""
    if (get(body, "vendorInvoiceRequest.chargeList", null) !== null) {
      if (
        get(body, "vendorInvoiceRequest.chargeList[0].code", null) !== null ||
        get(body, "vendorInvoiceRequest.chargeList[0].charge", null) !== null
      ) {
        updateQuery = `update dbo.tbl_shipmentapar set ${get(columnFromCode, get(body, "vendorInvoiceRequest.chargeList[0].code", "default"), "total")}=sum(${get(body,"vendorInvoiceRequest.chargeList[0].charge",0)}) where fk_orderno='${fileNumber}' and fk_vendorid='${get(body,"vendorInvoiceRequest.vendorId",null)}' and finalize<>'Y'`;
      }
    } else {
      updateQuery = `update dbo.tbl_shipmentapar set refno='${get(body,"vendorInvoiceRequest.vendorReference",null)}' where fk_orderno='${fileNumber}' and fk_vendorid='${get(body,"vendorInvoiceRequest.vendorId",null)}' and finalize<>'Y'`;
    }
    console.info("updateQuery: ", updateQuery);
    const updateResult = await request.query(updateQuery);
    console.info("updateResult: ", updateResult);

    sql.close();
    console.info("Connection closed");
    itemObj.status = "SUCCESS";
    const dynamoInsert = await putItem(itemObj);
    console.info("dynamoInsert: ", dynamoInsert);
    return JSON.stringify({
      httpStatus: "[200]",
      id: itemObj.id,
      message: "success"
    });
  } catch (error) {
    console.error("Main lambda error: ", error);
    let errorMsgVal = "";
    if (get(error, "message", null) !== null) {
      errorMsgVal = get(error, "message", "");
    } else {
      errorMsgVal = error;
    }
    let flag = errorMsgVal.split(",")[0]
    if(flag !== "Error"){
      const params = {
        Message: `An error occurred in function ${context.functionName}. Error details: ${error}.`,
        TopicArn: process.env.ERROR_SNS_ARN,
      };
      await sns.publish(params).promise();
    }else{
      errorMsgVal = errorMsgVal.split(",")[1]
    }
    itemObj.errorMsg = errorMsgVal;
    itemObj.status = "FAILED";
    await putItem(itemObj);
    return callback(JSON.stringify({
      httpStatus: "[400]",
      message: errorMsgVal,
    }))
  }
};

async function putItem(item) {
  let params;
  try {
    params = {
      TableName: process.env.LOGS_TABLE,
      Item: item,
    };
    console.info("Insert Params: ", params);
    const dynamoInsert = await dynamodb.put(params).promise();
    return dynamoInsert;
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
    await sql.connect(config);
    console.info("Connected to SQL Server");
    const request = new sql.Request();
    return request;
  } catch (err) {
    console.error("Error: ", err);
    throw err;
  }
}
