const AWS = require("aws-sdk");
const ddb = new AWS.DynamoDB.DocumentClient();
const dynamo = new AWS.DynamoDB();
const moment = require("moment");
const { get } = require("lodash");
const { Converter } = AWS.DynamoDB;
// const { parseAndMappingData } = require("../shared/dataParser/shipmentDetailsDataParser");
const Joi = require("joi");
const {
  getDynamodbData,
  getDynamodbDataFromDateRange,
  parseAndMappingData,
} = require("../shared/commonFunctions/shipment_details");
const sns = new AWS.SNS();

module.exports.handler = async (event) => {
  console.log("event: ", JSON.stringify(event));
  // const eventBody = JSON.parse(event)
  // console.log("query string ", event.queryStringParameters)

  let dataObj = [];
  try {
    if (event.queryStringParameters) {
      if (
        event.queryStringParameters.hasOwnProperty("fileNumber") ||
        event.queryStringParameters.hasOwnProperty("housebill")
      ) {
        if (event.queryStringParameters.hasOwnProperty("fileNumber")) {
          console.log("fileNumber");
          dataObj = await queryWithFileNumber(
            process.env.SHIPMENT_DETAILS_Collector_TABLE,
            "fileNumberIndex",
            event.queryStringParameters.fileNumber.toString()
          );
        } else {
          console.log("housebill");
          dataObj = await queryWithHouseBill(
            process.env.SHIPMENT_DETAILS_Collector_TABLE,
            event.queryStringParameters.housebill.toString()
          );
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
          console.log("activityDate");
          const fromDateTime = moment(event.queryStringParameters.activityFromDate,"YYYY-MM-DD HH:mm:ss.SSS");
          const toDateTime = moment(event.queryStringParameters.activityToDate,"YYYY-MM-DD HH:mm:ss.SSS");

          const daysDifference = toDateTime.diff(fromDateTime, "days");
          if (daysDifference < 0) {
            console.log("activityToDate cannot be earlier than activityFromDate");
            throw "activityToDate cannot be earlier than activityFromDate";
          } else if (daysDifference > 7) {
            console.log(`date range cannot be more than 7days \n your date range ${daysDifference}`);
            throw `date range cannot be more than 7days \n your date range ${daysDifference}`;
          } else if (daysDifference == 0) {
            const hoursDiff = toDateTime.diff(fromDateTime, "hours");
            if (hoursDiff < 0) {
              console.log("activityToDate cannot be earlier than activityFromDate");
              throw "activityToDate cannot be earlier than activityFromDate";
            }
          }
          console.log(daysDifference);
          dataObj = await dateRange("activityDate", fromDateTime, toDateTime);
        } else {
          console.log("shipmentDate");
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
            console.log(
              "activityToDate cannot be earlier than activityFromDate"
            );
            throw "activityToDate cannot be earlier than activityFromDate";
          } else if (daysDifference > 7) {
            console.log(
              `date range cannot be more than 7days \n your date range ${daysDifference}`
            );
            throw `date range cannot be more than 7days \n your date range ${daysDifference}`;
          } else if (daysDifference == 0) {
            const hoursDiff = toDateTime.diff(fromDateTime, "hours");
            if (hoursDiff < 0) {
              console.log(
                "activityToDate cannot be earlier than activityFromDate"
              );
              throw "activityToDate cannot be earlier than activityFromDate";
            }
          }
          console.log(daysDifference);
          dataObj = await dateRange("shipmentDate", fromDateTime, toDateTime);
        }
      }
    }
    console.log("dataObj", JSON.stringify(dataObj));
    const data = await Promise.all(
      dataObj.map((d) => {
        return Converter.unmarshall(d);
      })
    );
    // const unmarshalledDataObj = Converter.unmarshall(dataObj[0][0])

    console.log("unmarshalledDataObj", JSON.stringify(data));

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: "success",
      }),
    };
  } catch {
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
  console.log("params:", params);

  try {
    const data = await dynamo.query(params).promise();
    return data.Items;
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

      console.log("eventObj: ", eventObj);

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

      console.log("orderObj: ", orderObj);

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
  console.log("params:", params);

  try {
    const data = await dynamo.query(params).promise();
    console.log("data.Items: ", data.Items);
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
  console.log("params:", params);

  try {
    const data = await dynamo.query(params).promise();
    return data.Items;
  } catch (error) {
    console.error("Query Error:", error);
    throw error;
  }
}
