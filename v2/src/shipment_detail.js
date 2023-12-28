const AWS = require("aws-sdk");
const dynamo = new AWS.DynamoDB();
const moment = require("moment");
const { get } = require("lodash");
const { Converter } = AWS.DynamoDB;
const { v4: uuidv4 } = require("uuid");
const momentTZ = require("moment-timezone");
const Joi = require("joi");
const { queryWithFileNumber,queryWithHouseBill,dateRange,queryWithEventDate,queryWithOrderDate,mappingPayload,putItem,base64Encode } = require("../shared/commonFunctions/shipment_details");
const sns = new AWS.SNS();

const validateQueryParams = (params) => {
  const schema = Joi.object({
    housebill: Joi.string().allow(""),
    fileNumber: Joi.string().allow(""),
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
  }).or("housebill", "fileNumber", "activityFromDate", "shipmentFromDate");

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

  const queryParams = {
    housebill: get(event, "query.housebill", null),
    milestone_history: get(event, "query.milestone_history", null),
    fileNumber: get(event, "query.fileNumber", null),
    activityFromDate: get(event, "query.activityFromDate", null),
    activityToDate: get(event, "query.activityToDate", null),
    shipmentFromDate: get(event, "query.shipmentFromDate", null),
    shipmentToDate: get(event, "query.shipmentToDate", null),
    b64str: get(event, "query.b64str", null),
  };

  const { error, value } = validateQueryParams(queryParams);
  
  if(error){
            let msg = get(error, "details[0].message", "")
                .split('" ')[1]
                .replace(/"/g, "");
            let key = get(error, "details[0].context.key", "");
            return { statusCode: 400, message: key + " " + msg };
  }

  let queryStringParams = value;

  logObj = {
    id: uuidv4(),
    housebill: get(queryStringParams, "housebill", null),
    milestone_history: get(queryStringParams, "milestone_history", null),
    fileNumber: get(queryStringParams, "fileNumber", null),
    activityFromDate: get(queryStringParams, "activityFromDate", null),
    activityToDate: get(queryStringParams, "activityToDate", null),
    shipmentFromDate: get(queryStringParams, "shipmentFromDate", null),
    shipmentToDate: get(queryStringParams, "shipmentToDate", null),
    b64str: get(queryStringParams, "b64str", null),
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
  let fullDataObj = {};
  try {
    if (get(queryStringParams, "fileNumber", null)) {
      dataObj = await queryWithFileNumber(process.env.SHIPMENT_DETAILS_Collector_TABLE,"fileNumberIndex",get(queryStringParams, "fileNumber", null));
      if (dataObj[0].status.S == "Pending") {
        mainResponse = "Payload is not ready yet, please try again later";
      } else {
        const unmarshalledDataObj = await Promise.all(
          dataObj.map((d) => {
            return Converter.unmarshall(d);
          })
        );
        mainResponse = await mappingPayload(unmarshalledDataObj, true);
      }
      logObj = {
        ...logObj,
        api_status_code: "200",
        payload: mainResponse,
      };
      await putItem(logObj);
    } else if (get(queryStringParams, "housebill", null)) {
      dataObj = await queryWithHouseBill(process.env.SHIPMENT_DETAILS_Collector_TABLE,get(queryStringParams, "housebill", null));
      if (dataObj[0].status.S == "Pending") {
        mainResponse = "Payload is not ready yet, please try again later";
      } else {
        const unmarshalledDataObj = await Promise.all(
          dataObj.map((d) => {
            return Converter.unmarshall(d);
          })
        );
        if (get(queryStringParams, "milestone_history", null)) {
          mainResponse = await mappingPayload(unmarshalledDataObj,get(queryStringParams, "milestone_history", null));
          logObj = {
            ...logObj,
            api_status_code: "200",
            payload: mainResponse,
          };
          await putItem(logObj);
        } else {
          mainResponse = await mappingPayload(unmarshalledDataObj, "true");
          logObj = {
            ...logObj,
            api_status_code: "200",
            payload: mainResponse,
          };
          await putItem(logObj);
        }
      }
    } else if (
      get(queryStringParams, "activityFromDate", null) &&
      get(queryStringParams, "activityToDate", null)
    ) {
      const fromDateTime = moment(
        get(queryStringParams, "activityFromDate", null),
        "YYYY-MM-DD HH:mm:ss.SSS"
      );
      const toDateTime = moment(
        get(queryStringParams, "activityToDate", null),
        "YYYY-MM-DD HH:mm:ss.SSS"
      );

      const base64 = get(queryStringParams, "b64str", null);
      let lastKey;
      if (get(queryStringParams, "b64str", {})) {
        lastKey = base64Decode(base64);
        const { error: eventError } = validateLastEventKey.validate(lastKey);
        if (eventError) {
          console.error(error.details);
          logObj = {
            ...logObj,
            api_status_code: "400",
            errorMsg: "Please verify whether b64str is valid.",
          }
          await putItem(logObj);
          return {
            statusCode: 400,
            body: JSON.stringify({
              message: "Please verify whether b64str is valid.",
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
        }
        await putItem(logObj);
        throw new Error("activityToDate cannot be earlier than activityFromDate");
      } else if (daysDifference > 7) {
        console.info(`date range cannot be more than 7days \n your date range ${daysDifference}`);
        logObj = {
          ...logObj,
          api_status_code: "400",
          errorMsg: "date range cannot be more than 7days",
        }
        throw new Error(`date range cannot be more than 7days \n your date range ${daysDifference}`);
      } else if (daysDifference == 0) {
        const hoursDiff = toDateTime.diff(fromDateTime, "hours");
        if (hoursDiff < 0) {
          console.info("activityToDate cannot be earlier than activityFromDate");
          logObj = {
            ...logObj,
            api_status_code: "400",
            errorMsg: "activityToDate cannot be earlier than activityFromDate",
          }
          throw new Error("activityToDate cannot be earlier than activityFromDate");
        }
      }
      fullDataObj = await dateRange("activityDate",fromDateTime,toDateTime,lastKey);
      dataObj = fullDataObj.items.Items.filter(
        (item) => item.status.S == "Ready"
      );
      if (dataObj.length == 0) {
        mainResponse = "Payloads are not ready yet, please try again later";
      } else {
        const unmarshalledDataObj = await Promise.all(
          dataObj.map((d) => {
            return Converter.unmarshall(d);
          })
        );
        mainResponse = await mappingPayload(unmarshalledDataObj, true);
      }
      logObj = {
        ...logObj,
        api_status_code: "200",
        payload: mainResponse,
      };
      await putItem(logObj);
    } else {
      const fromDateTime = moment(
        get(queryStringParams, "shipmentFromDate", null) + " 00:00:00.000",
        "YYYY-MM-DD HH:mm:ss.SSS"
      );

      const toDateTime = moment(
        get(queryStringParams, "shipmentToDate", null) + " 23:59:59.999",
        "YYYY-MM-DD HH:mm:ss.SSS"
      );

      const base64 = get(queryStringParams, "b64str", null);
      let lastKey;
      if (get(queryStringParams, "b64str", {})) {
        lastKey = base64Decode(base64);
        const { error: orderError } = validateLastOrderKey.validate(lastKey);
        if (orderError) {
          console.error(error.details);
          logObj = {
            ...logObj,
            api_status_code: "400",
            errorMsg: "Please verify whether b64str is valid.",
          }
          await putItem(logObj);
          return {
            statusCode: 400,
            body: JSON.stringify({
              message: "Please verify whether b64str is valid.",
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
        throw new Error ("shipmentToDate cannot be earlier than shipmentFromDate");
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
          throw new Error("shipmentToDate cannot be earlier than shipmentFromDate");
        }
      }
      fullDataObj = await dateRange("shipmentDate",fromDateTime,toDateTime,lastKey);
      dataObj = fullDataObj.items.Items.filter(
        (item) => item.status.S == "Ready"
      );
      if (dataObj.length == 0) {
        mainResponse = "Payloads are not ready yet, please try again later";
      } else {
        const unmarshalledDataObj = await Promise.all(
          dataObj.map((d) => {
            return Converter.unmarshall(d);
          })
        );
        mainResponse = await mappingPayload(unmarshalledDataObj, true);
      }
      logObj = {
        ...logObj,
        api_status_code: "200",
        payload: mainResponse,
      };
      await putItem(logObj);
    }
    return {
      Items: mainResponse,
      LastEvaluatedKey: get(fullDataObj, "lastEvaluatedKey", null),
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
