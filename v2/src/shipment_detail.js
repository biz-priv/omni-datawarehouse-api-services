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
    activityToDate: Joi.string().allow("").when('activityFromDate', {
        is: Joi.exist(), then: Joi.required()
    }),
    shipmentFromDate: Joi.string().allow(""),
    shipmentToDate: Joi.string().allow("").when('shipmentFromDate', {
        is: Joi.exist(), then: Joi.required()
    })
  }).or(
    'housebill',
    'fileNumber',
    'activityFromDate',
    'shipmentFromDate'
  );

  return schema.validate(params);
};

let logObj = {};

module.exports.handler = async (event) => {
  console.info("event: ", JSON.stringify(event));

  const queryParams = {
    housebill: get(event, "query.housebill", null),
    milestone_history: get(event,"query.milestone_history",null),
    fileNumber: get(event, "query.fileNumber", null),
    activityFromDate: get(event,"query.activityFromDate",null),
    activityToDate: get(event, "query.activityToDate", null),
    shipmentFromDate: get(event,"query.shipmentFromDate",null),
    shipmentToDate: get(event, "query.shipmentToDate", null),
    lastEvaluatedKey: get(event,"query.lastEvaluatedKey",null),
  };

  const { error, value } = validateQueryParams(queryParams);

  console.log("value: ", value);

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
    lastEvaluatedKey : get(queryStringParams,"lastEvaluatedKey",null),
    api_status_code: "",
    errorMsg: "",
    payload: "",
    inserted_time_stamp: momentTZ
      .tz("America/Chicago")
      .format("YYYY:MM:DD HH:mm:ss")
      .toString(),
  };
  console.log("logObj: ", logObj);
  let dataObj = [];
  let mainResponse = {};
  let fullDataObj = {};
  try {
    if (get(queryStringParams, "fileNumber", null)) {
      console.log("fileNumber");
      dataObj = await queryWithFileNumber(process.env.SHIPMENT_DETAILS_Collector_TABLE,"fileNumberIndex",get(queryStringParams, "fileNumber", null));
      //console.log("dataObj: ",dataObj)
      if (dataObj[0].status.S == "Pending") {
        mainResponse = "Payload is not ready yet, please try again later";
      } else {
        const unmarshalledDataObj = await Promise.all(
          dataObj.map((d) => {
            return Converter.unmarshall(d);
          })
        );
        //console.log("unmarshalledDataObj",JSON.stringify(unmarshalledDataObj));
        mainResponse = await mappingPayload(unmarshalledDataObj, true);
      }
      logObj = {
        ...logObj,
        api_status_code: "200",
        payload: mainResponse,
      };
      console.log("logObj", logObj);
      await putItem(logObj);
    } else if (get(queryStringParams, "housebill", null)) {
      console.log("housebill");
      dataObj = await queryWithHouseBill(process.env.SHIPMENT_DETAILS_Collector_TABLE,get(queryStringParams, "housebill", null));
      if (dataObj[0].status.S == "Pending") {
        mainResponse = "Payload is not ready yet, please try again later";
      } else {
        const unmarshalledDataObj = await Promise.all(
          dataObj.map((d) => {
            return Converter.unmarshall(d);
          })
        );
        //console.log("unmarshalledDataObj",JSON.stringify(unmarshalledDataObj));
        if (get(queryStringParams, "milestone_history", null)) {
          mainResponse = await mappingPayload(unmarshalledDataObj,get(queryStringParams, "milestone_history", null));
          logObj = {
            ...logObj,
            api_status_code: "200",
            payload: mainResponse,
          };
          console.log("logObj", logObj);
          await putItem(logObj);
        } else {
          mainResponse = await mappingPayload(unmarshalledDataObj, true);
          logObj = {
            ...logObj,
            api_status_code: "200",
            payload: mainResponse,
          };
          console.log("logObj", logObj);
          await putItem(logObj);
        }
      }
    } else if (
      get(queryStringParams, "activityFromDate", null) &&
      get(queryStringParams, "activityToDate", null)
    ) {
      console.log("activityDate");
      const fromDateTime = moment(
        get(queryStringParams, "activityFromDate", null),
        "YYYY-MM-DD HH:mm:ss.SSS"
      );
      const toDateTime = moment(
        get(queryStringParams, "activityToDate", null),
        "YYYY-MM-DD HH:mm:ss.SSS"
      );
      // let lastKey;

      // if(get(queryStringParams,"lastEvaluatedKey",null)){
      //   lastKey = moment(
      //     get(queryStringParams,"lastEvaluatedKey",null),
      //     "YYYY-MM-DD HH:mm:ss.SSS"
      //   );
      // }else{
      //   lastKey = ""
      // }

      const lastKey = moment(get(queryStringParams,"lastEvaluatedKey",null),"YYYY-MM-DD HH:mm:ss.SSS");
      console.log("startDate,endDate",fromDateTime,toDateTime,lastKey)

      // const daysDifference = toDateTime.diff(fromDateTime, "days");
      // if (daysDifference < 0) {
      //   console.log("activityToDate cannot be earlier than activityFromDate");
      //   logObj = {
      //     ...logObj,
      //     api_status_code: "400",
      //     errorMsg: "activityToDate cannot be earlier than activityFromDate",
      //     payload: mainResponse,
      //   }
      //   console.log("logObj", logObj);
      //   await putItem(logObj);
      //   throw "activityToDate cannot be earlier than activityFromDate";
      // } else if (daysDifference > 7) {
      //   console.log(`date range cannot be more than 7days \n your date range ${daysDifference}`);
      //   logObj = {
      //     ...logObj,
      //     api_status_code: "400",
      //     errorMsg: "date range cannot be more than 7days",
      //     payload: mainResponse,
      //   }
      //   console.log("logObj", logObj);
      //   throw `date range cannot be more than 7days \n your date range ${daysDifference}`;
      // } else if (daysDifference == 0) {
      //   const hoursDiff = toDateTime.diff(fromDateTime, "hours");
      //   if (hoursDiff < 0) {
      //     console.log("activityToDate cannot be earlier than activityFromDate");
      //     logObj = {
      //       ...logObj,
      //       api_status_code: "400",
      //       errorMsg: "activityToDate cannot be earlier than activityFromDate",
      //       payload: mainResponse,
      //     }
      //     console.log("logObj", logObj);
      //     throw "activityToDate cannot be earlier than activityFromDate";
      //   }
      // }
      // console.log(daysDifference);
      fullDataObj = await dateRange("activityDate",fromDateTime,toDateTime,lastKey);
      console.log("fullDataObj: ",fullDataObj)
      dataObj = fullDataObj.items.Items.filter((item) => item.status.S == "Ready");
      console.log("dataObj: ", dataObj);
      if (dataObj.length == 0) {
        mainResponse = "Payloads are not ready yet, please try again later";
      } else {
        const unmarshalledDataObj = await Promise.all(
          dataObj.map((d) => {
            return Converter.unmarshall(d);
          })
        );
        //console.log("unmarshalledDataObj",JSON.stringify(unmarshalledDataObj));
        mainResponse = await mappingPayload(unmarshalledDataObj, true);
      }
      logObj = {
        ...logObj,
        api_status_code: "200",
        payload: mainResponse,
      };
      console.log("logObj", logObj);
      await putItem(logObj);
    } else {
      //console.log("shipmentDate");
      // const fromDateTime = moment(
      //   get(queryStringParams, "shipmentFromDate", null),
      //   "YYYY-MM-DD HH:mm:ss.SSS"
      // );
      // const toDateTime = moment(
      //   get(queryStringParams, "shipmentToDate", null),
      //   "YYYY-MM-DD HH:mm:ss.SSS"
      // );

      const fromDateTime = moment(
        get(queryStringParams, "shipmentFromDate", null) + " 00:00:00.000",
        "YYYY-MM-DD HH:mm:ss.SSS"
      );
      
      const toDateTime = moment(
        get(queryStringParams, "shipmentToDate", null) + " 23:59:59.999",
        "YYYY-MM-DD HH:mm:ss.SSS"
      );
      const lastKey = moment(
        get(queryStringParams,"lastEvaluatedKey",null) + " 00:00:00.000",
        "YYYY-MM-DD HH:mm:ss.SSS"
      );
       
      console.log("startDate,endDate", fromDateTime, toDateTime, lastKey)
      const daysDifference = toDateTime.diff(fromDateTime, "days");
      if (daysDifference < 0) {
        console.log("shipmentToDate cannot be earlier than shipmentFromDate");
        logObj = {
          ...logObj,
          api_status_code: "400",
          errorMsg: "shipmentToDate cannot be earlier than shipmentFromDate",
          payload: mainResponse,
        };
        console.log("logObj", logObj);
        throw "shipmentToDate cannot be earlier than shipmentFromDate";
      } else if (daysDifference > 7) {
        console.log(
          `date range cannot be more than 7days \n your date range ${daysDifference}`
        );
        logObj = {
          ...logObj,
          api_status_code: "400",
          errorMsg: "date range cannot be more than 7days",
          payload: mainResponse,
        };
        console.log("logObj", logObj);
        throw `date range cannot be more than 7days \n your date range ${daysDifference}`;
      } else if (daysDifference == 0) {
        const hoursDiff = toDateTime.diff(fromDateTime, "hours");
        if (hoursDiff < 0) {
          console.log("shipmentToDate cannot be earlier than shipmentFromDate");
          logObj = {
            ...logObj,
            api_status_code: "400",
            errorMsg: "shipmentToDate cannot be earlier than shipmentFromDate",
            payload: mainResponse,
          };
          console.log("logObj", logObj);
          throw "shipmentToDate cannot be earlier than shipmentFromDate";
        }
      }
      //console.log(daysDifference);
      fullDataObj = await dateRange("shipmentDate",fromDateTime,toDateTime,lastKey);
      console.log("fullDataObj: ",fullDataObj)
      dataObj = fullDataObj.items.Items.filter((item) => item.status.S == "Ready");
      console.log("dataObj: ", dataObj);
      if (dataObj.length == 0) {
        mainResponse = "Payloads are not ready yet, please try again later";
      } else {
        const unmarshalledDataObj = await Promise.all(
          dataObj.map((d) => {
            return Converter.unmarshall(d);
          })
        );
        //console.log("unmarshalledDataObj",JSON.stringify(unmarshalledDataObj));
        mainResponse = await mappingPayload(unmarshalledDataObj, true);
      }
      logObj = {
        ...logObj,
        api_status_code: "200",
        payload: mainResponse,
      };
      console.log("logObj", logObj);
      await putItem(logObj);
    }
    return {
      statusCode: 200,
      body: JSON.stringify({
        Items: mainResponse,
        LastEvaluatedKey: get(fullDataObj,"lastEvaluatedKey",null)
      }),
    };
  } catch (error) {
    console.log("in main function: \n", error);
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
  //console.log("params:", params);

  try {
    const data = await dynamo.query(params).promise();
    return data.Items;
  } catch (error) {
    console.error("Query Error:", error);
    throw error;
  }
}

async function queryWithHouseBill(tableName, HouseBillNumber) {
  //console.log("queryWithHouseBill");
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

async function dateRange(eventType, eventDateTimeFrom, eventDateTimeTo,lastEvaluatedKey) {
  try {
    if (eventType == "activityDate") {
      const fromDateTime = moment(eventDateTimeFrom);
      const toDateTime = moment(eventDateTimeTo);
      const lastKey = moment(lastEvaluatedKey);
      const formattedStartDate = fromDateTime.format("YYYY-MM-DD HH:mm:ss.SSS");
      const formattedEndDate = toDateTime.format("YYYY-MM-DD HH:mm:ss.SSS");
      const formattedLastKey = lastKey.format("YYYY-MM-DD HH:mm:ss.SSS");
      const eventDate = fromDateTime.format("YYYY");
      return await queryWithEventDate(eventDate,formattedStartDate,formattedEndDate,formattedLastKey);
    } else {
      const fromDateTime = moment(eventDateTimeFrom);
      const toDateTime = moment(eventDateTimeTo);
      const lastKey = moment(lastEvaluatedKey);
      const formattedStartDate = fromDateTime.format("YYYY-MM-DD HH:mm:ss.SSS");
      const formattedEndDate = toDateTime.format("YYYY-MM-DD HH:mm:ss.SSS");
      const formattedLastKey = lastKey.format("YYYY-MM-DD HH:mm:ss.SSS");
      const eventDate = fromDateTime.format("YYYY");
      return await queryWithOrderDate(eventDate,formattedStartDate,formattedEndDate,formattedLastKey);
    }
  } catch (error) {
    console.log("date range function: ", error);
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
  console.log("queryWithEventDate,params:", params);
  if (lastEvaluatedKey) {
    params.ExclusiveStartKey = lastEvaluatedKey;
    console.log("params.ExclusiveStartKey", params.ExclusiveStartKey);
  }

  try {
    const result = await dynamo.query(params).promise();
    console.log("result");
    return {
      items: result,
      lastEvaluatedKey: result.LastEvaluatedKey,
    };
  } catch (error) {
    console.error("EventDate,Query Error:", error);
    console.log("params:", params);
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
  console.log("queryWithOrderDate,params:", params);
  console.log("lastEvaluatedKey",lastEvaluatedKey)
  if (lastEvaluatedKey) {
    params.ExclusiveStartKey = lastEvaluatedKey;
    console.log("params.ExclusiveStartKey", params.ExclusiveStartKey);
  }

  try {
    const result = await dynamo.query(params).promise();
    console.log("result");
    return {
      items: result,
      lastEvaluatedKey: result.LastEvaluatedKey,
    };
  } catch (error) {
    console.error("OrderDate,Query Error:", error);
    console.log("params:", params);
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
    if (milestone_history == true) {
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
    console.log("Inserted into logs table");
    await dynamodb.put(params).promise();
  } catch (e) {
    console.error("Put Item Error: ", e, "\nPut params: ", params);
  }
}
