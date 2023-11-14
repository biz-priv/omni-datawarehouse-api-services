const AWS = require("aws-sdk");
const ddb = new AWS.DynamoDB.DocumentClient();
const dynamo = new AWS.DynamoDB();
const moment = require("moment");
const { get } = require("lodash");
const { Converter } = AWS.DynamoDB;
const { v4: uuidv4 } = require("uuid");
const momentTZ = require("moment-timezone"); 
// const { parseAndMappingData } = require("../shared/dataParser/shipmentDetailsDataParser");
const Joi = require("joi");
const {
  getDynamodbData,
  getDynamodbDataFromDateRange,
  parseAndMappingData,
} = require("../shared/commonFunctions/shipment_details");
const sns = new AWS.SNS();

let logObj = {};

module.exports.handler = async (event) => {
  console.log("event: ", JSON.stringify(event));
  // const eventBody = JSON.parse(event)
  // console.log("query string ", event.queryStringParameters)
  logObj = {
    Id: uuidv4(),
    housebill: event.queryStringParameters.fileNumber.toString() ?? "",
    milestone_history: event.queryStringParameters.fileNumber.toString() ?? "",
    fileNumber: event.queryStringParameters.fileNumber.toString() ?? "",
    activityFromDate: event.queryStringParameters.fileNumber.toString() ?? "",
    activityToDate: event.queryStringParameters.fileNumber.toString() ?? "",
    shipmentFromDate: event.queryStringParameters.fileNumber.toString() ?? "",
    shipmentToDate: event.queryStringParameters.fileNumber.toString() ?? "",
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
  try {
    if (event.queryStringParameters) {
      if (
        event.queryStringParameters.hasOwnProperty("fileNumber") ||
        event.queryStringParameters.hasOwnProperty("housebill")
      ) {
        if (event.queryStringParameters.hasOwnProperty("fileNumber")) {
          //console.log("fileNumber");
          dataObj = await queryWithFileNumber(
            process.env.SHIPMENT_DETAILS_Collector_TABLE,
            "fileNumberIndex",
            event.queryStringParameters.fileNumber.toString()
          );
          const unmarshalledDataObj = await Promise.all(
            dataObj.map((d) => {
              return Converter.unmarshall(d);
            })
          );
          //console.log("unmarshalledDataObj",JSON.stringify(unmarshalledDataObj));
          mainResponse = await mappingPayload(unmarshalledDataObj, true);
          logObj = {
            ...logObj,
            api_status_code: "200",
            payload: mainResponse,
          };
          console.log("eventLogObj", eventLogObj);
          await putItem(logObj);
        } else {
          //console.log("housebill");
          dataObj = await queryWithHouseBill(
            process.env.SHIPMENT_DETAILS_Collector_TABLE,
            event.queryStringParameters.housebill.toString()
          );
          const unmarshalledDataObj = await Promise.all(
            dataObj.map((d) => {
              return Converter.unmarshall(d);
            })
          );
          //console.log("unmarshalledDataObj",JSON.stringify(unmarshalledDataObj));
          if(event.queryStringParameters.hasOwnProperty("milestone_history")){
          mainResponse = await mappingPayload(unmarshalledDataObj, event.queryStringParameters.milestone_history);
          logObj = {
            ...logObj,
            api_status_code: "200",
            payload: mainResponse,
          }
          console.log("eventLogObj", eventLogObj);
          await putItem(logObj);
        }
          else{
          mainResponse = await mappingPayload(unmarshalledDataObj, true);
          logObj = {
            ...logObj,
            api_status_code: "200",
            payload: mainResponse,
          }
          console.log("eventLogObj", eventLogObj);
          await putItem(logObj);
          }
        }
      } else if (
        (event.queryStringParameters.hasOwnProperty("activityFromDate") &&
          event.queryStringParameters.hasOwnProperty("activityToDate")) ||
        (event.queryStringParameters.hasOwnProperty("shipmentFromDate") &&
          event.queryStringParameters.hasOwnProperty("shipmentToDate"))
      ) {
        if (
          event.queryStringParameters.hasOwnProperty("activityFromDate") &&
          event.queryStringParameters.hasOwnProperty("activityToDate")
        ) {
          //console.log("activityDate");
          const fromDateTime = moment(
            event.queryStringParameters.activityFromDate,
            "YYYY-MM-DD HH:mm:ss.SSS"
          );
          const toDateTime = moment(
            event.queryStringParameters.activityToDate,
            "YYYY-MM-DD HH:mm:ss.SSS"
          );

          const daysDifference = toDateTime.diff(fromDateTime, "days");
          if (daysDifference < 0) {
            console.log("activityToDate cannot be earlier than activityFromDate");
            logObj = {
              ...logObj,
              api_status_code: "400",
              errorMsg: "activityToDate cannot be earlier than activityFromDate",
              payload: mainResponse,
            }
            console.log("eventLogObj", eventLogObj);
            await putItem(logObj);
            throw "activityToDate cannot be earlier than activityFromDate";
          } else if (daysDifference > 7) {
            console.log(`date range cannot be more than 7days \n your date range ${daysDifference}`);
            logObj = {
              ...logObj,
              api_status_code: "400",
              errorMsg: "date range cannot be more than 7days",
              payload: mainResponse,
            }
            console.log("eventLogObj", eventLogObj);
            throw `date range cannot be more than 7days \n your date range ${daysDifference}`;
          } else if (daysDifference == 0) {
            const hoursDiff = toDateTime.diff(fromDateTime, "hours");
            if (hoursDiff < 0) {
              console.log("activityToDate cannot be earlier than activityFromDate");
              logObj = {
                ...logObj,
                api_status_code: "400",
                errorMsg: "activityToDate cannot be earlier than activityFromDate",
                payload: mainResponse,
              }
              console.log("eventLogObj", eventLogObj);
              throw "activityToDate cannot be earlier than activityFromDate";
            }
          }
          //console.log(daysDifference);
          dataObj = await dateRange("activityDate", fromDateTime, toDateTime);
          const unmarshalledDataObj = await Promise.all(
            dataObj.map((d) => {
              return Converter.unmarshall(d);
            })
          );
          //console.log("unmarshalledDataObj",JSON.stringify(unmarshalledDataObj));
          mainResponse = await mappingPayload(unmarshalledDataObj, true);
          logObj = {
            ...logObj,
            api_status_code: "200",
            payload: mainResponse,
          }
          console.log("eventLogObj", eventLogObj);
          await putItem(logObj);
        } else {
          //console.log("shipmentDate");
          const fromDateTime = moment(
            event.queryStringParameters.activityFromDate,
            "YYYY-MM-DD HH:mm:ss.SSS"
          );
          const toDateTime = moment(
            event.queryStringParameters.activityToDate,
            "YYYY-MM-DD HH:mm:ss.SSS"
          );

          const daysDifference = toDateTime.diff(fromDateTime, "days");
          if (daysDifference < 0) {
            console.log("shipmentToDate cannot be earlier than shipmentFromDate");
            logObj = {
              ...logObj,
              api_status_code: "400",
              errorMsg: "shipmentToDate cannot be earlier than shipmentFromDate",
              payload: mainResponse,
            }
            console.log("eventLogObj", eventLogObj);
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
            }
            console.log("eventLogObj", eventLogObj);
            throw `date range cannot be more than 7days \n your date range ${daysDifference}`;
          } else if (daysDifference == 0) {
            const hoursDiff = toDateTime.diff(fromDateTime, "hours");
            if (hoursDiff < 0) {
              console.log(
                "shipmentToDate cannot be earlier than shipmentFromDate"
              );
              logObj = {
                ...logObj,
                api_status_code: "400",
                errorMsg: "shipmentToDate cannot be earlier than shipmentFromDate",
                payload: mainResponse,
              }
              console.log("eventLogObj", eventLogObj);
              throw "shipmentToDate cannot be earlier than shipmentFromDate";
            }
          }
          //console.log(daysDifference);
          dataObj = await dateRange("shipmentDate", fromDateTime, toDateTime);
          const unmarshalledDataObj = await Promise.all(
            dataObj.map((d) => {
              return Converter.unmarshall(d);
            })
          );
          // console.log(
          //   "unmarshalledDataObj",
          //   JSON.stringify(unmarshalledDataObj)
          // );
          mainResponse = await mappingPayload(unmarshalledDataObj, true);
          logObj = {
            ...logObj,
            api_status_code: "200",
            payload: mainResponse,
          }
          console.log("eventLogObj", eventLogObj);
          await putItem(logObj);
        }
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: mainResponse,
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

async function dateRange(eventType, eventDateTimeFrom, eventDateTimeTo) {
  try {
    if (eventType == "activityDate") {
      let eventObj = [];
      let dataEventObj = [];
      const fromDateTime = moment(eventDateTimeFrom);
      const toDateTime = moment(eventDateTimeTo);

      while (fromDateTime <= toDateTime) {
        const eventDate = fromDateTime.format("YYYY-MM-DD");
        const eventDateTimeEnd = moment.min(
          moment(fromDateTime).endOf("day"),
          toDateTime
        );

        const formattedStartDate = fromDateTime.format(
          "YYYY-MM-DD HH:mm:ss.SSS"
        );
        const formattedEndDate = eventDateTimeEnd.format(
          "YYYY-MM-DD HH:mm:ss.SSS"
        );

        eventObj.push({
          eventDate: eventDate,
          eventDateTimeStart: formattedStartDate,
          eventDateTimeEnd: formattedEndDate,
        });

        fromDateTime.add(1, "days").startOf("day");
      }

      //console.log("eventObj: ", eventObj);

      //dataEventObj["shipmentDetailResponse"] = [];
      if (eventObj.length > 0) {
        for (const event of eventObj) {
          try {
            const data = await queryWithEventDate(
              process.env.SHIPMENT_DETAILS_Collector_TABLE,
              "EventDateIndex",
              event.eventDate,
              event.eventDateTimeStart,
              event.eventDateTimeEnd
            );
            dataEventObj.push(...data);
          } catch (error) {
            console.error("Error querying with date and time:", error);
          }
        }
      } else {
        console.log("There are no orders in this date range");
      }
      console.log("dataEventObj: ", dataEventObj);
      return dataEventObj;
    } else {
      let orderObj = [];
      let dataOrderObj = [];
      const fromDateTime = moment(orderDateTimeFrom);
      const toDateTime = moment(orderDateTimeTo);

      while (fromDateTime <= toDateTime) {
        const orderDate = fromDateTime.format("YYYY-MM-DD");
        const orderDateTimeEnd = moment.min(
          moment(fromDateTime).endOf("day"),
          toDateTime
        );

        const formattedStartDate = fromDateTime.format(
          "YYYY-MM-DD HH:mm:ss.SSS"
        );
        const formattedEndDate = orderDateTimeEnd.format(
          "YYYY-MM-DD HH:mm:ss.SSS"
        );

        orderObj.push({
          orderDate: orderDate,
          orderDateTimeStart: formattedStartDate,
          orderDateTimeEnd: formattedEndDate,
        });

        fromDateTime.add(1, "days").startOf("day");
      }

      //console.log("orderObj: ", orderObj);

      //dataOrderObj["shipmentDetailResponse"] = [];
      if (orderObj.length > 0) {
        for (const order of orderObj) {
          try {
            const data = await queryWithOrderDate(
              process.env.SHIPMENT_DETAILS_Collector_TABLE,
              "OrderDateIndex",
              order.orderDate,
              order.orderDateTimeStart,
              order.orderDateTimeEnd
            );
            dataOrderObj.push(...data);
          } catch (error) {
            console.error("Error querying with date and time:", error);
          }
        }
      } else {
        console.log("There are no orders in this date range");
      }
      console.log("dataOrderObj: ", dataOrderObj);
      return dataOrderObj;
    }
  } catch (error) {
    console.log("date range function: ", error);
  }
}

async function queryWithEventDate(
  tableName,
  indexName,
  date,
  startSortKey,
  endSortKey
) {
  const params = {
    TableName: tableName,
    IndexName: indexName,
    KeyConditionExpression:
      "#date = :dateValue AND #sortKey BETWEEN :startSortKey AND :endSortKey",
    ExpressionAttributeNames: {
      "#date": "EventDate",
      "#sortKey": "EventDateTime",
    },
    ExpressionAttributeValues: {
      ":dateValue": { S: date },
      ":startSortKey": { S: startSortKey },
      ":endSortKey": { S: endSortKey },
    },
  };
  //console.log("params:", params);

  try {
    const data = await dynamo.query(params).promise();
    //console.log("data.Items: ", data.Items);
    return data.Items;
  } catch (error) {
    console.error("Query Error:", error);
    throw error;
  }
}

async function queryWithOrderDate(
  tableName,
  indexName,
  date,
  startSortKey,
  endSortKey
) {
  const params = {
    TableName: tableName,
    IndexName: indexName,
    KeyConditionExpression:
      "#date = :dateValue AND #sortKey BETWEEN :startSortKey AND :endSortKey",
    ExpressionAttributeNames: {
      "#date": "OrderDate",
      "#sortKey": "OrderDateTime",
    },
    ExpressionAttributeValues: {
      ":dateValue": { S: date },
      ":startSortKey": { S: startSortKey },
      ":endSortKey": { S: endSortKey },
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

async function mappingPayload(data, milestone_history) {
  // const response = {};
  // response["shipmentDetailResponse"] = [];
  const response = [];
  //console.log("mappingPayload");
  for (const i of data) {
    //console.log("data.filnumb", i);
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
    // response["shipmentDetailResponse"].push(payload)
    response.push(payload)
    //console.log("response: ", response);
  }
  // return response
  const pageSize = 10;
  const pageNumber = 1;
  const paginatedResult = {};
  paginatedResult["shipmentDetailResponse"]=[];
  paginatedResult["shipmentDetailResponse"].push(await paginateData(response, pageNumber, pageSize));
  console.log("paginatedResult",paginatedResult)
  return paginatedResult
}

async function paginateData(data, pageNumber, pageSize) {
  const startIndex = (pageNumber - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const paginatedData = data.slice(startIndex, endIndex);
  return paginatedData;
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
    console.log("Inserted");
    await dynamodb.put(params).promise();
  } catch (e) {
    console.error("Put Item Error: ", e, "\nPut params: ", params);
  }
}