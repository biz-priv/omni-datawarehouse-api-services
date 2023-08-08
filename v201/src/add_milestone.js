const axios = require("axios");
const { convert } = require("xmlbuilder2");
const Joi = require("joi");
const AWS = require('aws-sdk');
var dynamodb = new AWS.DynamoDB.DocumentClient();
const s3 = new AWS.S3();
const { v4: uuidv4 } = require("uuid");
const momentTZ = require("moment-timezone");

const {
  SHIPMENT_APAR_TABLE,
  SHIPMENT_HEADER_TABLE,
  ADDRESS_MAPPING_TABLE,
  MILESTONE_LOG_TABLE,
  MILESTONE_ORDER_STATUS,
  IVIA_VENDOR_ID,
} = process.env;

const statusCodes = MILESTONE_ORDER_STATUS.split(",");
console.log(statusCodes);

const statusCodeValidation = Joi.string()
  .alphanum()
  .required()
  .valid(...statusCodes);

const eventValidation = Joi.object()
.keys({
  addMilestoneRequest: Joi.object()
    .keys({
      housebill: Joi.string().alphanum().required(),
      statusCode: statusCodeValidation,
      eventTime: Joi.string().required(),
    })
    .required(),
})
.required();

const eventDeliveredValidation = Joi.object()
  .keys({
    addMilestoneRequest: Joi.object()
      .keys({
        housebill: Joi.string().required(),
        statusCode: statusCodeValidation,
        eventTime: Joi.string().required(),
        latitude: Joi.number(),
        longitude: Joi.number(),
        signatory: Joi.string().required(),
      })
      .required(),
  })
  .required();

  const eventLocationValidation = Joi.object()
  .keys({
    addMilestoneRequest: Joi.object()
      .keys({
        housebill: Joi.string().required(),
        statusCode: statusCodeValidation,
        eventTime: Joi.string().required(),
        latitude: Joi.number().required(),
        longitude: Joi.number().required(),
        signatory: Joi.string(),
      })
      .required(),
  })
  .required();


const statusCodeSchema = Joi.object({
  addMilestoneRequest: Joi.object({
    housebill: Joi.string().required(),
    statusCode: Joi.string().valid("CAN").required(),
    eventTime: Joi.string(),
  }),
});

let eventLogObj = {
  Id: "",
  createdAt: "",
  housebill: "",
  statusCode: "",
  latitude: "",
  longitude: "",
  eventTime: "",
  signatory: "",
  payload: "",
  sentPayload: "",
  xmlPayload: "",
  xmlResponse: "",
  FK_OrderNo: "",
  FK_ServiceId: "",
  consineeIsCustomer: "0",
  consineeIsCustomerObj: "",
  isEventStatusIgnored: "0",
  response: "",
  errorMsg: "",
  isSuccess: "F",
};

function setEventLogObj(key, value, isJson = false) {
  eventLogObj = {
    ...eventLogObj,
    [key]: isJson ? JSON.stringify(value) : value,
  };
}


module.exports.handler = async (event, context, callback) => {
  console.info("event", JSON.stringify(event));

  eventLogObj = {
    Id: "",
    createdAt: "",
    houseBill: "",
    statusCode: "",
    latitude: "",
    longitude: "",
    eventTime: "",
    signatory: "",
    payload: "",
    sentPayload: "",
    xmlPayload: "",
    xmlResponse: "",
    FK_OrderNo: "",
    FK_ServiceId: "",
    consineeIsCustomer: "0",
    consineeIsCustomerObj: "",
    isEventStatusIgnored: "0",
    response: "",
    errorMsg: "",
    isSuccess: "F",
  };
  
  eventLogObj.Id = uuidv4();
  eventLogObj.createdAt = momentTZ
    .tz("America/Chicago")
    .format("YYYY-MM-DD HH:mm:ss")
    .toString();


  const { body } = event;

  let validationData = "";
  eventLogObj = {
    ...eventLogObj,
    houseBill: body.addMilestoneRequest?.housebill?.toString() ?? "",
    statusCode: body.addMilestoneRequest?.statusCode?.toString() ?? "",
    eventTime: body.addMilestoneRequest?.eventTime?.toString() ?? "",
    latitude: body.addMilestoneRequest?.latitude?.toString() ?? "",
    longitude: body.addMilestoneRequest?.longitude?.toString() ?? "",
    signatory: body.addMilestoneRequest?.signatory?.toString() ?? "",
  };

  if (!body.hasOwnProperty("addMilestoneRequest")) {
    console.log("eventLogObj", eventLogObj);
    return callback(response("[400]", "addMilestoneRequest is required"));
  }

  if (body.addMilestoneRequest.statusCode === "DEL") {
    validationData = eventDeliveredValidation.validate(body);
  } else if(body.addMilestoneRequest.statusCode === "LOC"){
    validationData = eventLocationValidation.validate(body);
  } else {
    validationData = eventValidation.validate(body);
  }

  const { error, value } = validationData;
  console.info("validated data", value);
  if (error) {
    let msg = error.details[0].message
      .split('" ')[1]
      .replace(new RegExp('"', "g"), "");
    let key = error.details[0].context.key;

    setEventLogObj("errorMsg", key + " " + msg);
    console.log("eventLogObj", eventLogObj);
    return callback(response("[400]", key + " " + msg));
  }

  // const statusCode = body.addMilestoneRequest.statusCode;
  // const houseBillNumber = body.addMilestoneRequest.housebill;

  // const paramsshipmentHeader = {
  //   TableName: process.env.SHIPMENT_HEADER_TABLE,
  //   IndexName: "Housebill-index",
  //   KeyConditionExpression: "Housebill = :Housebill",
  //   ExpressionAttributeValues: {
  //     ":Housebill": houseBillNumber,
  //   },
  // };


  // let shipmentHeaderResponse = await queryDynamo(paramsshipmentHeader);
  // console.log("shipmentHeaderResponse", shipmentHeaderResponse)
  // if (shipmentHeaderResponse.Items.length === 0) {
  //   return callback(
  //     response(
  //       "[400]",
  //       "Housebill does not exist"
  //     )
  //   );
  // }

  const timestamp = momentTZ().format('YYYYMMDD_HHmmss');
  // Append timestamp to the file name
  const fileNameWithTimestamp = 'add_milestone_' +`${timestamp}.json`;

  const payload = JSON.stringify(event);
  const params = {
    Bucket: 'dw-test-etl-job',
    Key: `Test/${fileNameWithTimestamp}`,
    Body: payload,
    ContentType: 'application/json'
  }

  const s3Response = await s3.putObject(params).promise();

  console.log("S3 Response", s3Response);

  return {
    addMilestoneResponse: {
      message: 'Success',
      id: eventLogObj.Id
    },
  };

  

};
//*******************************************************************//
async function validateApiForHouseBill(apiKey, housebill) {
  try {
    let params = {
      TableName: process.env.TOKEN_VALIDATION_TABLE,
      IndexName: process.env.TOKEN_VALIDATION_TABLE_INDEX,
      KeyConditionExpression: "ApiKey = :apikey",
      ExpressionAttributeValues: {
        ":apikey": apiKey
      }
    }
    let result = await dynamodb.query(params).promise();

    if (result.Items.length == 0) {
      return false;
    }

    let customerId = result.Items[0].CustomerID;
    let allowedCustomerIds = JSON.parse(process.env.ALLOWED_CUSTOMER_IDS);

    console.log("House Bill : ", housebill);
    console.log("Customer Id : ", customerId);
    console.log("allowedCustomerIds : ", allowedCustomerIds)
    console.log("condition : ", allowedCustomerIds.includes(customerId))
    if (allowedCustomerIds.includes(customerId)) {
      return true
    }

    params = {
      TableName: process.env.CUSTOMER_ENTITLEMENT_TABLE,
      IndexName: process.env.CUSTOMER_ENTITLEMENT_HOUSEBILL_INDEX,
      KeyConditionExpression: "CustomerID = :id AND HouseBillNumber = :houseBill",
      ExpressionAttributeValues: {
        ":id": customerId,
        ":houseBill": housebill
      }
    }
    result = await dynamodb.query(params).promise();

    if (result.Items.length > 0) {
      return true;
    }
  } catch (e) {
    console.log("Error in validateApiForHouseBill", e)
  }
  return false;
}

/**
 * send the event data to the addMilestone api
 * @param {*} value
 * @param {*} callback
 * @returns
 */
async function sendEvent(value, callback) {
  const addMilestoneData = value.addMilestoneRequest;
  const eventBody = {
    ...addMilestoneData,
    eventTime: addMilestoneData.eventTime.replace("Z", "+00:00"),
  };

  try {
    const postData = makeJsonToXml(eventBody);
    console.log("postData", postData);

    const dataResponse = await addMilestoneApi(postData);
    console.log("dataResponse", dataResponse);

    const dataObj = makeXmlToJson(dataResponse, eventBody.statusCode);
    console.log("dataObj", dataObj);

    if (dataObj.addMilestoneResponse.message === "success") {
      return dataObj;
    } else {
      return callback(response("[400]", "failed"));
    }
  } catch (error) {
    return callback(
      response(
        "[500]",
        error != null && error.hasOwnProperty("message") ? error.message : error
      )
    );
  }
}

/**
 * depending on staus_code create a xml_payload form json
 * @param {*} data
 * @returns
 */
function makeJsonToXml(data) {
  let xml = "";

  xml = convert({
    "soap:Envelope": {
      "@xmlns:xsi": "http://www.w3.org/2001/XMLSchema-instance",
      "@xmlns:xsd": "http://www.w3.org/2001/XMLSchema",
      "@xmlns:soap": "http://schemas.xmlsoap.org/soap/envelope/",
      "soap:Body": {
        UpdateStatus: {
          "@xmlns": "http://tempuri.org/",
          HandlingStation: "",
          HAWB: data.housebill,
          UserName: "BIZCLOUD",
          StatusCode: data.statusCode,
          EventDateTime: data.eventTime,
        },
      },
    },
  });

  console.info("xml payload", xml);
  return xml;
}

/**
 * depending on the stausCode convert Xml to json
 * @param {*} data
 * @param {*} statusCode
 * @returns
 */
function makeXmlToJson(data, statusCode) {
  try {
    let obj = convert(data, { format: "object" });
    console.log("obj:makeXmlToJson", JSON.stringify(obj));
    let message = "failed";

    message =
      obj["soap:Envelope"]["soap:Body"].UpdateStatusResponse.UpdateStatusResult;

    return {
      addMilestoneResponse: {
        message: message === "true" ? "success" : "failed",
      },
    };
  } catch (e) {
    console.log("e:makeXmlToJson", e);
    throw "Unable to convert xml to json";
  }
}

/**
 * return response
 * @param {*} code
 * @param {*} message
 * @returns
 */
function response(code, message) {
  return JSON.stringify({
    httpStatus: code,
    message,
  });
}

/**
 * send postData to the ADD_MILESTONE_URL api
 * @param {*} postData
 * @returns
 */
async function addMilestoneApi(postData) {
  try {
    const res = await axios.post(process.env.ADD_MILESTONE_URL, postData, {
      headers: {
        Accept: "text/xml",
        "Content-Type": "text/xml",
      },
    });
    if (res.status == 200) {
      return res.data;
    } else {
      throw "Request Failed";
    }
  } catch (e) {
    console.log("e:addMilestoneApi", e);
    throw "Request Failed";
  }
}


async function queryDynamo(params) {
  try {
    const documentClient = new AWS.DynamoDB.DocumentClient({
      region: process.env.REGION,
    });
    const response = await documentClient.query(params).promise();
    return response;
  } catch (error) {
    console.log("error", error);
    return { Items: [] };
  }
}

async function queryWithIndex(tableName, index, keys, otherParams = null) {
  let params;
  try {
    const [expression, expressionAtts] = await getQueryExpression(keys);
    params = {
      TableName: tableName,
      IndexName: index,
      KeyConditionExpression: expression,
      ExpressionAttributeValues: expressionAtts,
    };
    if (otherParams) params = { ...params, ...otherParams };
    return await dynamodb.query(params).promise();
  } catch (e) {
    console.error("Query Item Error: ", e, "\nQuery params: ", params);
    throw "QueryItemError";
  }
}