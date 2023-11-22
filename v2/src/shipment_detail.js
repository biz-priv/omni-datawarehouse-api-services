const AWS = require("aws-sdk");
const dynamo = new AWS.DynamoDB();
const moment = require("moment");
const { get } = require("lodash");
const { Converter } = AWS.DynamoDB;
const { v4: uuidv4 } = require("uuid");
const momentTZ = require("moment-timezone");
const Joi = require("joi");
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
        throw "activityToDate cannot be earlier than activityFromDate";
      } else if (daysDifference > 7) {
        console.info(`date range cannot be more than 7days \n your date range ${daysDifference}`);
        logObj = {
          ...logObj,
          api_status_code: "400",
          errorMsg: "date range cannot be more than 7days",
        }
        throw `date range cannot be more than 7days \n your date range ${daysDifference}`;
      } else if (daysDifference == 0) {
        const hoursDiff = toDateTime.diff(fromDateTime, "hours");
        if (hoursDiff < 0) {
          console.info("activityToDate cannot be earlier than activityFromDate");
          logObj = {
            ...logObj,
            api_status_code: "400",
            errorMsg: "activityToDate cannot be earlier than activityFromDate",
          }
          throw "activityToDate cannot be earlier than activityFromDate";
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
        throw "shipmentToDate cannot be earlier than shipmentFromDate";
      } else if (daysDifference > 7) {
        console.info(
          `date range cannot be more than 7days \n your date range ${daysDifference}`
        );
        logObj = {
          ...logObj,
          api_status_code: "400",
          errorMsg: "date range cannot be more than 7days",
        };
        throw `date range cannot be more than 7days \n your date range ${daysDifference}`;
      } else if (daysDifference == 0) {
        const hoursDiff = toDateTime.diff(fromDateTime, "hours");
        if (hoursDiff < 0) {
          console.info("shipmentToDate cannot be earlier than shipmentFromDate");
          logObj = {
            ...logObj,
            api_status_code: "400",
            errorMsg: "shipmentToDate cannot be earlier than shipmentFromDate",
          };
          throw "shipmentToDate cannot be earlier than shipmentFromDate";
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

async function queryWithFileNumber(tableName, indexName, fileNumber) {
  const params = {
    TableName: tableName,
    IndexName: indexName,
    KeyConditionExpression: "fileNumber = :value",
    ExpressionAttributeValues: {
      ":value": { S: fileNumber },
    },
  };

  try {
    const data = await dynamo.query(params).promise();
    return get(data, "Items", []);
  } catch (error) {
    console.error("Query Error:", error);
    throw error;
  }
}

async function queryWithHouseBill(tableName, HouseBillNumber) {
  let params = {
    TableName: tableName,
    KeyConditionExpression: "HouseBillNumber = :value",
    ExpressionAttributeValues: {
      ":value": { S: HouseBillNumber },
    },
  };
  try {
    let data = await dynamo.query(params).promise();
    return get(data, "Items", []);
  } catch (e) {
    console.error("Query Error:", error);
    throw error;
  }
}

async function dateRange(
  eventType,
  eventDateTimeFrom,
  eventDateTimeTo,
  lastEvaluatedKey
) {
  try {
    if (eventType == "activityDate") {
      const fromDateTime = moment(eventDateTimeFrom);
      const toDateTime = moment(eventDateTimeTo);
      const formattedStartDate = fromDateTime.format("YYYY-MM-DD HH:mm:ss.SSS");
      const formattedEndDate = toDateTime.format("YYYY-MM-DD HH:mm:ss.SSS");
      const eventDate = fromDateTime.format("YYYY");
      return await queryWithEventDate(eventDate,formattedStartDate,formattedEndDate,lastEvaluatedKey);
    } else {
      const fromDateTime = moment(eventDateTimeFrom);
      const toDateTime = moment(eventDateTimeTo);
      const formattedStartDate = fromDateTime.format("YYYY-MM-DD HH:mm:ss.SSS");
      const formattedEndDate = toDateTime.format("YYYY-MM-DD HH:mm:ss.SSS");
      const eventDate = fromDateTime.format("YYYY");
      return await queryWithOrderDate(eventDate,formattedStartDate,formattedEndDate,lastEvaluatedKey);
    }
  } catch (error) {
    console.error("date range function: ", error);
    throw error;
  }
}

async function queryWithEventDate(date,startSortKey,endSortKey,lastEvaluatedKey) {
  const params = {
    TableName: process.env.SHIPMENT_DETAILS_Collector_TABLE,
    IndexName: "EventYearIndex",
    KeyConditionExpression:
      "#date = :dateValue AND #sortKey BETWEEN :startSortKey AND :endSortKey",
    ExpressionAttributeNames: {
      "#date": "EventYear",
      "#sortKey": "EventDateTime",
    },
    ExpressionAttributeValues: {
      ":dateValue": { S: date },
      ":startSortKey": { S: startSortKey },
      ":endSortKey": { S: endSortKey },
    },
    Limit: 10,
  };
  if (lastEvaluatedKey) {
    params.ExclusiveStartKey = lastEvaluatedKey;
  }
  try {
    const result = await dynamo.query(params).promise();
    let base64;
    if (get(result, "LastEvaluatedKey", {})) {
      const lastEvaluatedKeyData = get(result, "LastEvaluatedKey", {});
      base64 = base64Encode(lastEvaluatedKeyData);
    }
    return {
      items: result,
      lastEvaluatedKey: base64,
    };
  } catch (error) {
    console.error("EventDate,Query Error:", error);
    throw error;
  }
}

async function queryWithOrderDate(date,startSortKey,endSortKey,lastEvaluatedKey) {
  const params = {
    TableName: process.env.SHIPMENT_DETAILS_Collector_TABLE,
    IndexName: "OrderYearIndex",
    KeyConditionExpression:
      "#date = :dateValue AND #sortKey BETWEEN :startSortKey AND :endSortKey",
    ExpressionAttributeNames: {
      "#date": "OrderYear",
      "#sortKey": "OrderDateTime",
    },
    ExpressionAttributeValues: {
      ":dateValue": { S: date },
      ":startSortKey": { S: startSortKey },
      ":endSortKey": { S: endSortKey },
    },
    Limit: 10,
  };

  if (lastEvaluatedKey) {
    params.ExclusiveStartKey = lastEvaluatedKey;
  }

  try {
    const result = await dynamo.query(params).promise();
    let base64;
    if (get(result, "LastEvaluatedKey", {})) {
      const lastEvaluatedKeyData = get(result, "LastEvaluatedKey", {});
      base64 = base64Encode(lastEvaluatedKeyData);
    }
    return {
      items: result,
      lastEvaluatedKey: base64,
    };
  } catch (error) {
    console.error("OrderDate,Query Error:", error);
    throw error;
  }
}

async function mappingPayload(data, milestone_history) {
  const response = {};
  response["shipmentDetailResponse"] = [];
  for (const i of data) {
    const payload = {
      fileNumber: get(i, "fileNumber", null),
      housebill: get(i, "HouseBillNumber", null),
      masterbill: get(i, "masterbill", null),
      shipmentDate: get(i, "shipmentDate", null),
      handlingStation: get(i, "handlingStation", null),
      originPort: get(i, "originPort", null),
      destinationPort: get(i, "destinationPort", null),
      shipper: get(i, "shipper", {
        name: "",
        address: "",
        city: "",
        state: "",
        zip: "",
        country: "",
      }),
      consignee: get(i, "consignee", {
        name: "",
        address: "",
        city: "",
        state: "",
        zip: "",
        country: "",
      }),
      pieces: get(i, "pieces", null),
      actualWeight: get(i, "actualWeight", null),
      chargeableWeight: get(i, "chargeableWeight", null),
      weightUOM: get(i, "weightUOM", null),
      pickupTime: get(i, "pickupTime", null),
      estimatedDepartureTime: get(i, "estimatedDepartureTime", null),
      estimatedArrivalTime: get(i, "estimatedArrivalTime", null),
      scheduledDeliveryTime: get(i, "scheduledDeliveryTime", null),
      deliveryTime: get(i, "deliveryTime", null),
      podName: get(i, "podName", null),
      serviceLevelCode: get(i, "serviceLevelCode", null),
      serviceLevelDescription: get(i, "serviceLevelDescription", null),
      customerReference: get(i, "customerReference", []),
      locations: get(i, "locations", []),
    };
    if (milestone_history == "true") {
      const milestoneData = {
        milestones: get(i, "milestones", []),
      };
      payload["milestones"] = milestoneData.milestones;
    }
    response["shipmentDetailResponse"].push(payload);
  }
  return response;
}

async function putItem(item) {
  const dynamodb = new AWS.DynamoDB.DocumentClient({
    region: process.env.REGION,
  });

  let params;
  try {
    params = {
      TableName: process.env.SHIPMENT_DETAILS_LOGS__TABLE,
      Item: item,
    };
    await dynamodb.put(params).promise();
  } catch (e) {
    console.error("Put Item Error: ", e, "\nPut params: ", params);
    throw error;
  }
}

function base64Encode(data) {
  const jsonString = JSON.stringify(data);

  const base64Encoded = Buffer.from(jsonString).toString("base64");

  return base64Encoded;
}

function base64Decode(data) {

  const decodedString = JSON.parse(
    Buffer.from(data, "base64").toString("utf-8")
  );

  return decodedString;
}
