const AWS = require("aws-sdk");
const dynamo = new AWS.DynamoDB();
const moment = require("moment");
const { get } = require("lodash");

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
  } catch (error) {
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
    Limit: 30,
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
    Limit: 30,
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
    if (milestone_history != false) {
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
  } catch (error) {
    console.error("Put Item Error: ", error, "\nPut params: ", params);
    throw error;
  }
}

function base64Encode(data) {
  const jsonString = JSON.stringify(data);

  const base64Encoded = Buffer.from(jsonString).toString("base64");

  return base64Encoded;
}


module.exports = { queryWithFileNumber,queryWithHouseBill,dateRange,queryWithEventDate,queryWithOrderDate,mappingPayload,putItem,base64Encode };