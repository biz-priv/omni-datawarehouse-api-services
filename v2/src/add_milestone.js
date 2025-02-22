/*
* File: v2\src\add_milestone.js
* Project: Omni-datawarehouse-api-services
* Author: Bizcloud Experts
* Date: 2023-08-14
* Confidential and Proprietary
*/
const axios = require("axios");
const { convert } = require("xmlbuilder2");
const Joi = require("joi");
const AWS = require('aws-sdk');
var dynamodb = new AWS.DynamoDB.DocumentClient();


const statusCodeSchema = Joi.object({
  addMilestoneRequest: Joi.object({
    housebill: Joi.string().required(),
    statusCode: Joi.string().valid("CAN").required(),
    eventTime: Joi.string(),
  }),
});

module.exports.handler = async (event, context, callback) => {
  console.info("event", JSON.stringify(event));

  const { body } = event;

  
  await statusCodeSchema.validateAsync(body);
  console.log("Status Code Validation Schema done");

  let validationResult = await validateApiForHouseBill(event.identity.apiKey, body.addMilestoneRequest.housebill)
  console.log("validationResult", validationResult)
  if (!validationResult) {
    return callback(
      response(
        "[400]",
        "House bill number does not exist"
      )
    );
  }

  console.log("body", body);
  const housebill = body.addMilestoneRequest.housebill;
  const paramsshipmentHeader = {
    TableName: process.env.SHIPMENT_HEADER_TABLE,
    IndexName: "Housebill-index",
    KeyConditionExpression: "Housebill = :Housebill",
    ExpressionAttributeValues: {
      ":Housebill": housebill,
    },
  };

  let shipmentHeaderResponse = await queryDynamo(paramsshipmentHeader);
  console.log("shipmentHeaderResponse", shipmentHeaderResponse)
  if (shipmentHeaderResponse.Items.length === 0) {
    return callback(
      response(
        "[400]",
        "Housebill does not exist"
      )
    );
  }
  const data = shipmentHeaderResponse.Items[0]
  const FK_OrderStatusId = data.FK_OrderStatusId

  if (FK_OrderStatusId === 'NEW' || FK_OrderStatusId === 'WEB') {
    return sendEvent(body, callback);
  } else {
    return callback(
      response(
        "[400]",
        // {
        //   "addMilestoneResponse": {
        //     "message": "Shipment cannot be Cancelled. Order Status of the Shipment is " + FK_OrderStatusId
        //   }
        // }
        "Shipment cannot be Cancelled. Order Status of the Shipment is " + FK_OrderStatusId
      )
    );
  }

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

    console.log("Before Querying DB");
    let result = await dynamodb.query(params).promise();
    console.log("After Querying DB");


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