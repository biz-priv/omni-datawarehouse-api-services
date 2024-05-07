const AWS = require("aws-sdk");
// const dynamo = new AWS.DynamoDB();
const moment = require("moment");
const { get } = require("lodash");
const dynamodb = new AWS.DynamoDB.DocumentClient();

async function queryWithFileNumber(tableName, fileNumber, customerId) {
  const params = {
    TableName: tableName,
    KeyConditionExpression: "fileNumber = :value AND customerIds = :customerId",
    ExpressionAttributeValues: {
      ":value": fileNumber,
      ":customerId": customerId
    },
  };

  try {
    const data = await dynamodb.query(params).promise();
    // const custIDs = get(data.Items, "[0].customerIds", "");
    // let dataFlag = '';
    // if (get(data, "Items") && custIDs && custIDs.S.includes(customerId)) {
    //   return [get(data, "Items", []), dataFlag];
    // }
    // else if (get(data, "Items")) {
    //   dataFlag = 'Yes';
    //   return [get(data, "Items", []), dataFlag];
    // }
    // else {
    //   return [[], dataFlag];
    // }
    return get(data, "Items", []);
  } catch (error) {
    console.error("Query Error:", error);
    throw error;
  }
}

async function queryWithHouseBill(tableName, indexName, HouseBillNumber, customerId) {
  let params = {
    TableName: tableName,
    IndexName: indexName,
    KeyConditionExpression: "customerIds = :customerId AND houseBillNumber = :value",
    ExpressionAttributeValues: {
      ":value": HouseBillNumber,
      ":customerId": customerId
    },
  };
  try {
    const data = await dynamodb.query(params).promise();
    // const custIDs = get(data.Items, "[0].customerIds", "");
    // let dataFlag = '';
    // if (get(data, "Items") && custIDs && custIDs.S.includes(customerId)) {
    //   return [get(data, "Items", []), dataFlag];
    // }
    // else if (get(data, "Items")) {
    //   dataFlag = 'Yes';
    //   return [get(data, "Items", []), dataFlag];
    // }
    // else {
    //   return [[], dataFlag];
    // }
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
  lastEvaluatedKey,
  customerId
) {
  try {
    if (eventType == "activityDate") {
      const fromDateTime = moment(eventDateTimeFrom);
      const toDateTime = moment(eventDateTimeTo);
      const formattedStartDate = fromDateTime.format("YYYY-MM-DD HH:mm:ss.SSS");
      const formattedEndDate = toDateTime.format("YYYY-MM-DD HH:mm:ss.SSS");
      // const eventDate = fromDateTime.format("YYYY");
      return await queryWithEventDate(formattedStartDate, formattedEndDate, lastEvaluatedKey, customerId);
    } else {
      const fromDateTime = moment(eventDateTimeFrom);
      const toDateTime = moment(eventDateTimeTo);
      const formattedStartDate = fromDateTime.format("YYYY-MM-DD HH:mm:ss.SSS");
      const formattedEndDate = toDateTime.format("YYYY-MM-DD HH:mm:ss.SSS");
      // const eventDate = fromDateTime.format("YYYY");
      return await queryWithOrderDate(formattedStartDate, formattedEndDate, lastEvaluatedKey, customerId);
    }
  } catch (error) {
    console.error("date range function: ", error);
    throw error;
  }
}

async function queryWithEventDate(startSortKey, endSortKey, lastEvaluatedKey, customerId) {
  const params = {
    TableName: process.env.SHIPMENT_DETAILS_COLLECTOR_TABLE,
    IndexName: "EventDateIndex",
    KeyConditionExpression:
      "customerIds = :customerId AND EventDateTime BETWEEN :startSortKey AND :endSortKey",
    ExpressionAttributeValues: {
      ":customerId": customerId,
      ":startSortKey": startSortKey,
      ":endSortKey": endSortKey
    },
    // FilterExpression: "contains (#customerIds, :customerId)",
    Limit: 30,
  };
  if (lastEvaluatedKey) {
    params.ExclusiveStartKey = lastEvaluatedKey;
  }
  try {
    const result = await dynamodb.query(params).promise();
    let base64 = "";
    if (get(result, "LastEvaluatedKey")) {
      const lastEvaluatedKeyData = get(result, "LastEvaluatedKey", {});
      base64 = base64Encode(lastEvaluatedKeyData);
    }
    return {
      items: result,
      lastEvaluatedKey: base64,
    };
    // let mainResult = [];
    // do {
    //   if (lastEvaluatedKey) {
    //     params.ExclusiveStartKey = lastEvaluatedKey;
    //   }
    //   const result = await dynamo.query(params).promise();
    //   mainResult = mainResult.concat(get(result, 'Items', []));
    //   if (get(result, "LastEvaluatedKey")) {
    //     lastEvaluatedKey = get(result, "LastEvaluatedKey",);
    //   } else {
    //     lastEvaluatedKey = null;
    //   }
    // } while (mainResult.length < 30 && lastEvaluatedKey);
    // let base64 = "";
    // if (lastEvaluatedKey) {
    //   // const lastEvaluatedKeyData = get(result, "LastEvaluatedKey", {});
    //   base64 = base64Encode(lastEvaluatedKey);
    // }
    // return {
    //   items: mainResult,
    //   lastEvaluatedKey: base64,
    // };
  } catch (error) {
    console.error("EventDate,Query Error:", error);
    throw error;
  }
}

async function queryWithOrderDate(startSortKey, endSortKey, lastEvaluatedKey, customerId) {
  const params = {
    TableName: process.env.SHIPMENT_DETAILS_COLLECTOR_TABLE,
    IndexName: "OrderDateIndex",
    KeyConditionExpression:
      "customerIds = :customerId AND OrderDateTime BETWEEN :startSortKey AND :endSortKey",
    ExpressionAttributeValues: {
      ":customerId": customerId,
      ":startSortKey": startSortKey,
      ":endSortKey": endSortKey
    },
    // FilterExpression: "contains (#customerIds, :customerId)",
    Limit: 30,
  };
  if (lastEvaluatedKey) {
    params.ExclusiveStartKey = lastEvaluatedKey;
  }

  try {
    const result = await dynamodb.query(params).promise();
    let base64 = "";
    if (get(result, "LastEvaluatedKey")) {
      const lastEvaluatedKeyData = get(result, "LastEvaluatedKey", {});
      base64 = base64Encode(lastEvaluatedKeyData);
    }
    return {
      items: result,
      lastEvaluatedKey: base64,
    };
    // let mainResult = [];
    // do {
    //   if (lastEvaluatedKey) {
    //     params.ExclusiveStartKey = lastEvaluatedKey;
    //   }
    //   const result = await dynamo.query(params).promise();
    //   mainResult = mainResult.concat(get(result, 'Items', []))
    //   if (get(result, "LastEvaluatedKey")) {
    //     lastEvaluatedKey = get(result, "LastEvaluatedKey",)
    //   } else {
    //     lastEvaluatedKey = null
    //   }
    // } while (mainResult.length < 30 && lastEvaluatedKey)
    // let base64 = "";
    // if (lastEvaluatedKey) {
    //   // const lastEvaluatedKeyData = get(result, "LastEvaluatedKey", {});
    //   base64 = base64Encode(lastEvaluatedKey);
    // }
    // return {
    //   items: mainResult,
    //   lastEvaluatedKey: base64,
    // };
  } catch (error) {
    console.error("OrderDate,Query Error:", error);
    throw error;
  }
}

async function getOrders(tableName, indexName, refNumber, customerId) {
  const params = {
    TableName: tableName,
    IndexName: indexName,
    KeyConditionExpression: "ReferenceNo = :value",
    ExpressionAttributeValues: {
      ":value": refNumber,
    },
  };
  const orderNos = [];

  try {
    const data = await dynamodb.query(params).promise();
    const dataItems = get(data, "Items", []);

    dataItems.forEach(item => {
      const orderNo = get(item, "PK_ReferenceNo.S");
      if (orderNo && !orderNos.includes(orderNo)) {
        orderNos.push(orderNo);
      }
    });

    console.info("Unique Order Numbers:", orderNos);
    const promises = orderNos.map(orderNo => queryWithFileNumber(process.env.SHIPMENT_DETAILS_COLLECTOR_TABLE, orderNo, customerId));


    const result = await Promise.all(promises);
    return { result };
    // const results = await Promise.all(promises);
    // const finalResult = [];
    // results.forEach(([items, dataFlag]) => {
    //   if (items && dataFlag === '') {
    //     finalResult.push(...items);
    //   }
    // });
    // return results;
  } catch (error) {
    console.error("Query Error:", error);
    throw error;
  }
}


async function mappingPayload(data, milestone_history) {
  const response = {};
  response["shipmentDetailResponse"] = [];
  for (const i of data) {
    const payload = {
      fileNumber: get(i, "fileNumber", ""),
      housebill: get(i, "houseBillNumber", ""),
      masterbill: get(i, "masterbill", ""),
      shipmentDate: get(i, "shipmentDate", ""),
      handlingStation: get(i, "handlingStation", ""),
      originPort: get(i, "originPort", ""),
      destinationPort: get(i, "destinationPort", ""),
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
      pieces: get(i, "pieces", 0),
      actualWeight: get(i, "actualWeight", 0),
      chargeableWeight: get(i, "chargeableWeight", 0),
      weightUOM: get(i, "weightUOM", ""),
      pickupTime: get(i, "pickupTime", ""),
      estimatedDepartureTime: get(i, "estimatedDepartureTime", ""),
      estimatedArrivalTime: get(i, "estimatedArrivalTime", ""),
      scheduledDeliveryTime: get(i, "scheduledDeliveryTime", ""),
      deliveryTime: get(i, "deliveryTime", ""),
      podName: get(i, "podName", ""),
      serviceLevelCode: get(i, "serviceLevelCode", ""),
      serviceLevelDescription: get(i, "serviceLevelDescription", ""),
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


module.exports = { queryWithFileNumber, queryWithHouseBill, dateRange, queryWithEventDate, queryWithOrderDate, mappingPayload, putItem, base64Encode, getOrders };