const AWS = require("aws-sdk");
const moment = require("moment");
const { get } = require("lodash");
const { Converter } = AWS.DynamoDB;
const { v4: uuidv4 } = require("uuid");
const momentTZ = require("moment-timezone");
const Joi = require("joi");
const { queryWithFileNumber, queryWithHouseBill, dateRange, mappingPayload, putItem, getOrders } = require("../shared/commonFunctions/shipment_details");
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
  OrderYear: Joi.object({
    S: Joi.string().required()
  }),
  HouseBillNumber: Joi.object({
    S: Joi.string().required()
  }),
  OrderDateTime: Joi.object({
    S: Joi.string().required()
  })
});

const validateLastEventKey = Joi.object({
  EventYear: Joi.object({
    S: Joi.string().required()
  }),
  HouseBillNumber: Joi.object({
    S: Joi.string().required()
  }),
  EventDateTime: Joi.object({
    S: Joi.string().required()
  })
});

let logObj = {};

module.exports.handler = async (event) => {
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

  logObj = {
    id: uuidv4(),
    housebill: get(queryStringParams, "housebill", null),
    milestoneHistory: get(queryStringParams, "milestoneHistory", null),
    fileNumber: get(queryStringParams, "fileNumber", null),
    refNumber: get(queryStringParams, "refNumber", null),
    activityFromDate: get(queryStringParams, "activityFromDate", null),
    activityToDate: get(queryStringParams, "activityToDate", null),
    shipmentFromDate: get(queryStringParams, "shipmentFromDate", null),
    shipmentToDate: get(queryStringParams, "shipmentToDate", null),
    nextStartToken: get(queryStringParams, "nextStartToken", null),
    api_status_code: "",
    errorMsg: "",
    payload: "",
    inserted_time_stamp: momentTZ
      .tz("America/Chicago")
      .format("YYYY:MM:DD HH:mm:ss")
      .toString(),
  };

  let dataObj = [];
  let mainResponse = {};
  let nextEndPoint;
  let flag;
  try {
    if (get(queryStringParams, "fileNumber", null)) {
      console.info("fileNumber", get(queryStringParams, "fileNumber", null));
      [dataObj, flag] = await queryWithFileNumber(process.env.SHIPMENT_DETAILS_COLLECTOR_TABLE, "fileNumberIndex", get(queryStringParams, "fileNumber", null), customerId);
      if (dataObj && flag === '') {
        const unmarshalledDataObj = await Promise.all(
          dataObj.map((d) => {
            return Converter.unmarshall(d);
          })
        );
        mainResponse = await mappingPayload(unmarshalledDataObj, true);

        logObj = {
          ...logObj,
          api_status_code: "200",
          payload: mainResponse,
        };
        await putItem(logObj);
      }
      else if (dataObj && flag === 'Yes') {
        throw new Error(`404,Invalid fileNumber`);
      } else {
        const unmarshalledDataObj = await Promise.all(
          dataObj.map((d) => {
            return Converter.unmarshall(d);
          })
        );
        mainResponse = await mappingPayload(unmarshalledDataObj, true);

        logObj = {
          ...logObj,
          api_status_code: "200",
          payload: mainResponse,
        };
        await putItem(logObj);
      }
    } else if (get(queryStringParams, "housebill", null)) {
      console.info("housebill", get(queryStringParams, "housebill", null));
      [dataObj, flag] = await queryWithHouseBill(process.env.SHIPMENT_DETAILS_COLLECTOR_TABLE, get(queryStringParams, "housebill", null), customerId);

      if (dataObj && flag === '') {
        const unmarshalledDataObj = await Promise.all(
          dataObj.map((d) => {
            return Converter.unmarshall(d);
          })
        );
        if (get(queryStringParams, "milestoneHistory") === true || get(queryStringParams, "milestoneHistory") === false) {
          console.info("milestoneHistory", get(queryStringParams, "milestoneHistory"));
          mainResponse = await mappingPayload(unmarshalledDataObj, get(queryStringParams, "milestoneHistory"));
          logObj = {
            ...logObj,
            api_status_code: "200",
            payload: mainResponse,
          };
          await putItem(logObj);
        } else {
          mainResponse = await mappingPayload(unmarshalledDataObj, true);
          logObj = {
            ...logObj,
            api_status_code: "200",
            payload: mainResponse,
          };
          await putItem(logObj);
        }
      }
      else if (dataObj && flag === 'Yes') {
        throw new Error(`404,Invalid housebill`);
      } else {
        const unmarshalledDataObj = await Promise.all(
          dataObj.map((d) => {
            return Converter.unmarshall(d);
          })
        );
        mainResponse = await mappingPayload(unmarshalledDataObj, true);

        logObj = {
          ...logObj,
          api_status_code: "200",
          payload: mainResponse,
        };
        await putItem(logObj);
      }

    } else if (get(queryStringParams, "refNumber", null)) {
      console.info("refNumber", get(queryStringParams, "refNumber", null));
      dataObj = await getOrders(process.env.REFERENCE_TABLE, "ReferenceNo-FK_RefTypeId-index", get(queryStringParams, "refNumber", null), customerId);
      const unmarshalledDataObj = await Promise.all(
          dataObj.map((d) => {
            return Converter.unmarshall(d);
          })
        );
      mainResponse = await mappingPayload(unmarshalledDataObj, true);
      logObj = {
        ...logObj,
        api_status_code: "200",
        payload: mainResponse,
      };
      await putItem(logObj);
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
          console.error(error.details);
          logObj = {
            ...logObj,
            api_status_code: "400",
            errorMsg: "Please verify whether nextStartToken is valid.",
          };
          await putItem(logObj);
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
        logObj = {
          ...logObj,
          api_status_code: "400",
          errorMsg: "activityToDate cannot be earlier than activityFromDate",
        };
        await putItem(logObj);
        throw new Error("activityToDate cannot be earlier than activityFromDate");
      } else if (daysDifference > 7) {
        console.info(`date range cannot be more than 7days \n your date range ${daysDifference}`);
        logObj = {
          ...logObj,
          api_status_code: "400",
          errorMsg: "date range cannot be more than 7days",
        };
        throw new Error(`date range cannot be more than 7days \n your date range ${daysDifference}`);
      } else if (daysDifference == 0) {
        const hoursDiff = toDateTime.diff(fromDateTime, "hours");
        if (hoursDiff < 0) {
          console.info("activityToDate cannot be earlier than activityFromDate");
          logObj = {
            ...logObj,
            api_status_code: "400",
            errorMsg: "activityToDate cannot be earlier than activityFromDate",
          };
          throw new Error("activityToDate cannot be earlier than activityFromDate");
        }
      }
      dataObj = await dateRange("activityDate", fromDateTime, toDateTime, lastKey, customerId);

      const unmarshalledDataObj = await Promise.all(
        dataObj.items.map((d) => {
          return Converter.unmarshall(d);
        })
      );
      mainResponse = await mappingPayload(unmarshalledDataObj, true);

      if (get(dataObj, "lastEvaluatedKey")) {
        nextEndPoint = "https://" + host + "/v2/shipment/detail?activityFromDate=" + get(queryStringParams, "activityFromDate", null) + "&activityToDate=" + get(queryStringParams, "activityToDate", null) + "&nextStartToken=" + get(dataObj, "lastEvaluatedKey");
      }
      logObj = {
        ...logObj,
        api_status_code: "200",
        payload: mainResponse,
      };
      await putItem(logObj);
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
        const { error: orderError } = validateLastOrderKey.validate(lastKey);
        if (orderError) {
          console.error(error.details);
          logObj = {
            ...logObj,
            api_status_code: "400",
            errorMsg: "Please verify whether nextStartToken is valid.",
          };
          await putItem(logObj);
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
        logObj = {
          ...logObj,
          api_status_code: "400",
          errorMsg: "shipmentToDate cannot be earlier than shipmentFromDate",
        };
        throw new Error("shipmentToDate cannot be earlier than shipmentFromDate");
      } else if (daysDifference > 7) {
        console.info(
          `date range cannot be more than 7days \n your date range ${daysDifference}`
        );
        logObj = {
          ...logObj,
          api_status_code: "400",
          errorMsg: "date range cannot be more than 7days",
        };
        throw new Error(`date range cannot be more than 7days \n your date range ${daysDifference}`);
      } else if (daysDifference == 0) {
        const hoursDiff = toDateTime.diff(fromDateTime, "hours");
        if (hoursDiff < 0) {
          console.info("shipmentToDate cannot be earlier than shipmentFromDate");
          logObj = {
            ...logObj,
            api_status_code: "400",
            errorMsg: "shipmentToDate cannot be earlier than shipmentFromDate",
          };
          throw new Error("404,shipmentToDate cannot be earlier than shipmentFromDate");
        }
      }
      dataObj = await dateRange("shipmentDate", fromDateTime, toDateTime, lastKey, customerId);

      const unmarshalledDataObj = await Promise.all(
        dataObj.items.map((d) => {
          return Converter.unmarshall(d);
        })
      );
      mainResponse = await mappingPayload(unmarshalledDataObj, true);

      if (get(dataObj, "lastEvaluatedKey")) {
        nextEndPoint = "https://" + host + "/v2/shipment/detail?shipmentFromDate=" + get(queryStringParams, "shipmentFromDate", null) + "&shipmentToDate=" + get(queryStringParams, "shipmentToDate", null) + "&nextStartToken=" + get(dataObj, "lastEvaluatedKey");
      }
      logObj = {
        ...logObj,
        api_status_code: "200",
        payload: mainResponse,
      };
      await putItem(logObj);
    }
    return {
      ...mainResponse,
      NextEndPoint: nextEndPoint ?? ""
    };
  } catch (error) {
    console.error("in main function: \n", error);
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