/*
* File: v2\src\shipment_detail.js
* Project: Omni-datawarehouse-api-services
* Author: Bizcloud Experts
* Date: 2024-04-29
* Confidential and Proprietary
*/
const AWS = require("aws-sdk");
const moment = require("moment");
const { get } = require("lodash");
const { v4: uuidv4 } = require("uuid");
const momentTZ = require("moment-timezone");
const Joi = require("joi");
const { queryWithFileNumber, queryWithHouseBill, dateRange, mappingPayload, getOrders } = require("../shared/commonFunctions/shipment_details");
const sns = new AWS.SNS();

const validateQueryParams = (params) => {
  const schema = Joi.object({
    housebill: Joi.string().allow(""),
    fileNumber: Joi.string().allow(""),
    refNumber: Joi.string().allow(""),
    activityFromDate: Joi.string().allow(""),
    activityToDate: Joi.string().allow("").when("activityFromDate", {
      is: Joi.exist(),
      then: Joi.required(),
    }),
    shipmentFromDate: Joi.string().allow(""),
    shipmentToDate: Joi.string().allow("").when("shipmentFromDate", {
      is: Joi.exist(),
      then: Joi.required(),
    }),
    milestoneHistory: Joi.boolean(),
    nextStartToken: Joi.string().allow(""),
  }).or("housebill", "fileNumber", "activityFromDate", "shipmentFromDate", "milestoneHistory", "nextStartToken", "refNumber");

  return schema.validate(params);
};

const validateLastOrderKey = Joi.object({
  customerIds: Joi.string().required(),
  fileNumber: Joi.string().required(),
  OrderDateTime: Joi.string().required()
});

const validateLastEventKey = Joi.object({
  customerIds: Joi.string().required(),
  fileNumber: Joi.string().required(),
  EventDateTime: Joi.string().required()
});

module.exports.handler = async (event, context, callback) => {
  console.info("event: ", JSON.stringify(event));

  if (event.source === "serverless-plugin-warmup") {
    console.info("WarmUp - Lambda is warm!");
    return "Lambda is warm!";
  }

  const host = get(event, "headers.Host");
  console.info("host", host);

  const customerId = get(event, "enhancedAuthContext.customerId");

  const { error, value } = validateQueryParams(get(event, "query"));

  if (error) {
    let msg = get(error, "details[0].message", "")
      .split('" ')[1]
      .replace(/"/g, "");
    let key = get(error, "details[0].context.key", "");
    return { message: key + " " + msg };
  }

  let queryStringParams = value;
  let dataObj = [];
  let mainResponse = {};
  let nextEndPoint;
  try {
    if (get(queryStringParams, "fileNumber", null)) {
      console.info("fileNumber", get(queryStringParams, "fileNumber", null));
      dataObj = await queryWithFileNumber(process.env.SHIPMENT_DETAILS_COLLECTOR_TABLE, get(queryStringParams, "fileNumber", null), customerId);
      if (dataObj && dataObj.length > 0) {
        if (get(queryStringParams, "milestoneHistory") === true || get(queryStringParams, "milestoneHistory") === false) {
          console.info("milestoneHistory", get(queryStringParams, "milestoneHistory"));
          mainResponse = await mappingPayload(dataObj, get(queryStringParams, "milestoneHistory"));
        } else {
          mainResponse = await mappingPayload(dataObj, false);
        }
      } else {
        console.info("Please check the fileNumber and provided API key");
        return {
          statusCode: 404,
          body: "Please check the fileNumber and provided API key"
        };
      }
    } else if (get(queryStringParams, "housebill", null)) {
      console.info("housebill", get(queryStringParams, "housebill", null));
      dataObj = await queryWithHouseBill(process.env.SHIPMENT_DETAILS_COLLECTOR_TABLE, "houseBillNumberIndex", get(queryStringParams, "housebill", null), customerId);
      if (dataObj && dataObj.length > 0) {
        if (get(queryStringParams, "milestoneHistory") === true || get(queryStringParams, "milestoneHistory") === false) {
          console.info("milestoneHistory", get(queryStringParams, "milestoneHistory"));
          mainResponse = await mappingPayload(dataObj, get(queryStringParams, "milestoneHistory"));
        } else {
          mainResponse = await mappingPayload(dataObj, false);
        }
      } else {
        console.info("Please check the housebill and provided API key");
        return {
          statusCode: 404,
          body: "Please check the housebill and provided API key"
        };
      }
    } else if (get(queryStringParams, "refNumber", null)) {
      console.info("refNumber", get(queryStringParams, "refNumber", null));
      dataObj = await getOrders(process.env.REFERENCE_TABLE, "ReferenceNo-FK_RefTypeId-index", get(queryStringParams, "refNumber", null), customerId);
      if (dataObj.result[0] && dataObj.result[0].length > 0) {
        if (get(queryStringParams, "milestoneHistory") === true || get(queryStringParams, "milestoneHistory") === false) {
          console.info("milestoneHistory", get(queryStringParams, "milestoneHistory"));
          mainResponse = await mappingPayload(dataObj.result[0], get(queryStringParams, "milestoneHistory"));
        } else {
          mainResponse = await mappingPayload(dataObj.result[0], false);
        }
      } else {
        console.info("Please check the refNumber and provided API key");
        return {
          statusCode: 404,
          body: "Please check the refNumber and provided API key"
        };
      }
    } else if (
      get(queryStringParams, "activityFromDate", null) &&
      get(queryStringParams, "activityToDate", null)
    ) {
      console.info("activityFromDate & activityToDate", get(queryStringParams, "activityFromDate", null) + "    ", get(queryStringParams, "activityToDate", null));
      const fromDateTime = moment(
        get(queryStringParams, "activityFromDate", null),
        "YYYY-MM-DD HH:mm:ss.SSS"
      );
      const toDateTime = moment(
        get(queryStringParams, "activityToDate", null),
        "YYYY-MM-DD HH:mm:ss.SSS"
      );

      const base64 = get(queryStringParams, "nextStartToken", null);
      let lastKey;
      if (get(queryStringParams, "nextStartToken")) {
        lastKey = base64Decode(base64);
        const { error: eventError } = validateLastEventKey.validate(lastKey);
        if (eventError) {
          console.error("Please verify whether nextStartToken is valid.",error);
          return {
            statusCode: 400,
            body: JSON.stringify({
              message: "Please verify whether nextStartToken is valid.",
            }),
          };
        }
      }

      const daysDifference = toDateTime.diff(fromDateTime, "days");
      if (daysDifference < 0) {
        console.info("activityToDate cannot be earlier than activityFromDate");
        throw new Error("activityToDate cannot be earlier than activityFromDate");
      } else if (daysDifference == 0) {
        const hoursDiff = toDateTime.diff(fromDateTime, "hours");
        if (hoursDiff < 0) {
          console.info("activityToDate cannot be earlier than activityFromDate");
          throw new Error("activityToDate cannot be earlier than activityFromDate");
        }
      }
      dataObj = await dateRange("activityDate", fromDateTime, toDateTime, lastKey, customerId);

      if (dataObj.items.Items && dataObj.items.Items.length > 0) {
        if (get(queryStringParams, "milestoneHistory") === true || get(queryStringParams, "milestoneHistory") === false) {
          console.info("milestoneHistory", get(queryStringParams, "milestoneHistory"));
          mainResponse = await mappingPayload(dataObj.items.Items, get(queryStringParams, "milestoneHistory"));
        } else {
          mainResponse = await mappingPayload(dataObj.items.Items, false);
        }
        if (get(dataObj, "lastEvaluatedKey")) {
          nextEndPoint = "https://" + host + "/v2/shipment/detail?activityFromDate=" + get(queryStringParams, "activityFromDate", null) + "&activityToDate=" + get(queryStringParams, "activityToDate", null) + "&nextStartToken=" + get(dataObj, "lastEvaluatedKey");
        }
      } else {
        console.info("Please change the date range and try. Also verify API key");
        return {
          statusCode: 404,
          body: "Please change the date range and try. Also verify API key"
        };
      }
    } else {
      console.info("shipmentFromDate & shipmentToDate", get(queryStringParams, "shipmentFromDate", null) + "    ", get(queryStringParams, "shipmentToDate", null));
      const fromDateTime = moment(
        get(queryStringParams, "shipmentFromDate", null) + " 00:00:00.000",
        "YYYY-MM-DD HH:mm:ss.SSS"
      );

      const toDateTime = moment(
        get(queryStringParams, "shipmentToDate", null) + " 23:59:59.999",
        "YYYY-MM-DD HH:mm:ss.SSS"
      );

      const base64 = get(queryStringParams, "nextStartToken", null);
      let lastKey;
      if (get(queryStringParams, "nextStartToken")) {
        lastKey = base64Decode(base64);
        console.log("lastKey", lastKey)
        const { error: orderError } = validateLastOrderKey.validate(lastKey);
        if (orderError) {
          console.error(error);
          return {
            statusCode: 400,
            body: JSON.stringify({
              message: "Please verify whether nextStartToken is valid.",
            }),
          };
        }
      }

      const daysDifference = toDateTime.diff(fromDateTime, "days");
      if (daysDifference < 0) {
        console.info("shipmentToDate cannot be earlier than shipmentFromDate");
        throw new Error("shipmentToDate cannot be earlier than shipmentFromDate");
      } else if (daysDifference == 0) {
        const hoursDiff = toDateTime.diff(fromDateTime, "hours");
        if (hoursDiff < 0) {
          console.info("shipmentToDate cannot be earlier than shipmentFromDate");
          throw new Error("404,shipmentToDate cannot be earlier than shipmentFromDate");
        }
      }
      dataObj = await dateRange("shipmentDate", fromDateTime, toDateTime, lastKey, customerId);
      if (dataObj.items.Items && dataObj.items.Items.length > 0) {
        if (get(queryStringParams, "milestoneHistory") === true || get(queryStringParams, "milestoneHistory") === false) {
          console.info("milestoneHistory", get(queryStringParams, "milestoneHistory"));
          mainResponse = await mappingPayload(dataObj.items.Items, get(queryStringParams, "milestoneHistory"));
        } else {
          mainResponse = await mappingPayload(dataObj.items.Items, false);
        }

        if (get(dataObj, "lastEvaluatedKey")) {
          nextEndPoint = "https://" + host + "/v2/shipment/detail?shipmentFromDate=" + get(queryStringParams, "shipmentFromDate", null) + "&shipmentToDate=" + get(queryStringParams, "shipmentToDate", null) + "&nextStartToken=" + get(dataObj, "lastEvaluatedKey");
        }
      } else {
        console.info("Please change the date range and try. Also verify API key");
        return {
          statusCode: 404,
          body: "Please change the date range and try. Also verify API key"
        };
      }
    }
    return {
      ...mainResponse,
      NextEndPoint: nextEndPoint ?? ""
    };
  } catch (error) {
    console.error("in main function: \n", error);
    try {
      const params = {
        Message: `An error occurred in function ${context.functionName}.\n\nERROR DETAILS: ${error}.`,
        Subject: `An error occured in function ${context.functionName}`,
        TopicArn: process.env.ERROR_SNS_TOPIC_ARN,
      };
      await sns.publish(params).promise();
      console.info('SNS notification has sent');
    } catch (err) {
      console.error('Error while sending sns notification: ', err);
    }
    return {
      statusCode: 400,
      body: JSON.stringify({
        message: `error: \n ${error}`,
      }),
    };
  }
};

function base64Decode(data) {

  const decodedString = JSON.parse(
    Buffer.from(data, "base64").toString("utf-8")
  );

  return decodedString;
}