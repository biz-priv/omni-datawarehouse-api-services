const AWS = require("aws-sdk");
const { Converter } = AWS.DynamoDB;
const dynamodb = new AWS.DynamoDB.DocumentClient();
const ddb = new AWS.DynamoDB.DocumentClient();
const { get } = require("lodash");
const moment = require('moment');

const { refParty,pieces,actualWeight,ChargableWeight,weightUOM,getTime,locationFunc,getShipmentDate,getPickupTime,getDynamodbData,getDynamodbDataFromDateRange, } = require("../../shared/commonFunctions/shipment_details");
const { tableValues,weightDimensionValue,INDEX_VALUES,customerTypeValue, } = require("../../shared/constants/shipment_details");

module.exports.handler = async (event) => {
  console.log("event: ", JSON.stringify(event));

  const unmarshalledData = Converter.unmarshall(
    event.Records[0].dynamodb.NewImage
  );
  let orderNo = unmarshalledData.FK_ShipOrderNo;
  console.log("orderNo",orderNo)
  let mainResponse = {};
  let timeZoneTable = {};
  const dynamodbData = {};
  try {
    const timeZoneTableParams = {
      TableName: process.env.TIMEZONE_MASTER_TABLE,
    };
    const timeZoneTableResult = await ddb.scan(timeZoneTableParams).promise();
    await Promise.all(
      timeZoneTableResult.Items.map(async (item) => {
        timeZoneTable[item.PK_TimeZoneCode] = item;
      })
    );

    await Promise.all(
      tableValues.map(async (tableValue) => {
        let params = {
          TableName: tableValue.tableName,
          KeyConditionExpression: `#pKey = :pKey`,
          ExpressionAttributeNames: {
            "#pKey": tableValue.pKey,
          },
          ExpressionAttributeValues: {
            ":pKey": orderNo,
          },
        };
        if (tableValue.getValues) {
          params.ProjectionExpression = tableValue.getValues;
        }
        const data = await ddb.query(params).promise();
        dynamodbData[tableValue.tableName] = data.Items;
      })
    );
    console.log("dynamodbData",dynamodbData)

    const PK_ServiceLevelId = get(dynamodbData,`${process.env.SHIPMENT_HEADER_TABLE}[0].FK_ServiceLevelId`,null);
    console.log("PK_ServiceLevelId", PK_ServiceLevelId);
  
    if (PK_ServiceLevelId != null || PK_ServiceLevelId != "") {
      /*
       *Dynamodb data from service level table
       */
      const servicelevelsTableParams = {
        TableName: process.env.SERVICE_LEVEL_TABLE,
        KeyConditionExpression: `#pKey = :pKey`,
        ExpressionAttributeNames: {
          "#pKey": "PK_ServiceLevelId",
        },
        ExpressionAttributeValues: {
          ":pKey": PK_ServiceLevelId,
        },
      };
      console.log("servicelevelsTableParams", servicelevelsTableParams);
      const servicelevelsTableResult = await ddb.query(servicelevelsTableParams).promise();
      dynamodbData[process.env.SERVICE_LEVEL_TABLE] =servicelevelsTableResult.Items;
    }

    const FK_ServiceLevelId = get(dynamodbData,`${process.env.SHIPMENT_MILESTONE_TABLE}[0].FK_ServiceLevelId`,null);
    const FK_OrderStatusId = get(dynamodbData,`${process.env.SHIPMENT_MILESTONE_TABLE}[0].FK_OrderStatusId`,null);
    console.log("FK_ServiceLevelId", FK_ServiceLevelId);
    console.log("FK_OrderStatusId", FK_OrderStatusId);
  
    if (FK_ServiceLevelId == null ||FK_ServiceLevelId == " " ||FK_ServiceLevelId == "" ||FK_OrderStatusId == null ||FK_OrderStatusId == "") {
      console.log("no servicelevelId for ",get(dynamodbData,`${process.env.SHIPMENT_MILESTONE_TABLE}[0].FK_OrderNo `, null ));
    } else {
      /*
       *Dynamodb data from milestone table
       */
      const milestoneTableParams = {
        TableName: process.env.MILESTONE_TABLE,
        KeyConditionExpression: `#pKey = :pKey and #sKey = :sKey`,
        FilterExpression: "IsPublic = :IsPublic",
        ExpressionAttributeNames: {
          "#pKey": "FK_OrderStatusId",
          "#sKey": "FK_ServiceLevelId",
        },
        ExpressionAttributeValues: {
          ":pKey": FK_OrderStatusId,
          ":sKey": FK_ServiceLevelId,
          ":IsPublic": "Y",
        },
      };
      //console.log("milestone params", milestoneTableParams);
      const milestoneTableResult = await ddb.query(milestoneTableParams).promise();
      console.log("milestoneTableResult", milestoneTableResult);
      dynamodbData[process.env.MILESTONE_TABLE] = milestoneTableResult.Items;
    }
    console.log("dynamodb", dynamodbData);
    
    mainResponse["shipmentDetailResponse"] = [];
    mainResponse["shipmentDetailResponse"].push(
      await parseAndMappingData(dynamodbData, timeZoneTable)
    );
    console.log("mainResponse", mainResponse);
  
    await upsertItem(process.env.SHIPMENT_DETAILS_Collector_TABLE, {
      ...mainResponse.shipmentDetailResponse[0],
    });
  } catch (error) {
    console.log("getDynamodbData: ", error);
  }
};

async function parseAndMappingData(data, timeZoneTable) {
  // console.log("inside data parsing function")
  // console.log("data ====>",data)
  const payload = {
    "fileNumber": get(data, `${process.env.SHIPMENT_HEADER_TABLE}[0].PK_OrderNo`, null),
    "HouseBillNumber": get(data, `${process.env.SHIPMENT_HEADER_TABLE}[0].Housebill`, null),
    "masterbill": get(data, `${process.env.SHIPMENT_HEADER_TABLE}[0].MasterAirWaybill`, null),
    "shipmentDate": await getShipmentDate(get(data, `${process.env.SHIPMENT_HEADER_TABLE}[0].ShipmentDateTime`, null)),
    //"shipmentDate": "naveen",
    "handlingStation": get(data, `${process.env.SHIPMENT_HEADER_TABLE}[0].HandlingStation`, null),
    "originPort": get(data, `${process.env.SHIPMENT_HEADER_TABLE}[0].OrgAirport`, null),
    "destinationPort": get(data, `${process.env.SHIPMENT_HEADER_TABLE}[0].DestAirport`, null),
    "shipper": {
      "name": get(data, `${process.env.SHIPPER_TABLE}[0].ShipName`, null),
      "address": get(data, `${process.env.SHIPPER_TABLE}[0].ShipAddress1`, null),
      "city": get(data, `${process.env.SHIPPER_TABLE}[0].ShipCity`, null),
      "state": get(data, `${process.env.SHIPPER_TABLE}[0].FK_ShipState`, null),
      "zip": get(data, `${process.env.SHIPPER_TABLE}[0].ShipZip`, null),
      "country": get(data, `${process.env.SHIPPER_TABLE}[0].FK_ShipCountry`, null)
    },
    "consignee": {
      "name": get(data, `${process.env.CONSIGNEE_TABLE}[0].ConName`, null),
      "address": get(data, `${process.env.CONSIGNEE_TABLE}[0].ConAddress1`, null),
      "city": get(data, `${process.env.CONSIGNEE_TABLE}[0].ConCity`, null),
      "state": get(data, `${process.env.CONSIGNEE_TABLE}[0].FK_ConState`, null),
      "zip": get(data, `${process.env.CONSIGNEE_TABLE}[0].ConZip`, null),
      "country": get(data, `${process.env.CONSIGNEE_TABLE}[0].FK_ConCountry`, null)
    },
    "pieces": await pieces(get(data, `${process.env.SHIPMENT_DESC_TABLE}`, null)),
    "actualWeight": await actualWeight(get(data, `${process.env.SHIPMENT_DESC_TABLE}`, 0)),
    "chargeableWeight": await ChargableWeight(get(data, `${process.env.SHIPMENT_DESC_TABLE}`, 0)),
    "weightUOM": await weightUOM(get(data, `${process.env.SHIPMENT_DESC_TABLE}[0].WeightDimension`, null)),
    "pickupTime": await getPickupTime(get(data, `${process.env.SHIPMENT_MILESTONE_DETAIL_TABLE}[0].EventDateTime`, null), get(data, `${process.env.SHIPMENT_MILESTONE_DETAIL_TABLE}[0].EventTimeZone`, null), timeZoneTable),
    "estimatedDepartureTime": "",
    "estimatedArrivalTime": await getTime(get(data, `${process.env.SHIPMENT_HEADER_TABLE}[0].ETADateTime`, null), get(data, `${process.env.SHIPMENT_HEADER_TABLE}[0].ETADateTimeZone`, null), timeZoneTable),
    "scheduledDeliveryTime": await getTime(get(data, `${process.env.SHIPMENT_HEADER_TABLE}[0].ScheduledDateTime`, null), get(data, `${process.env.SHIPMENT_HEADER_TABLE}[0].ScheduledDateTimeZone`, null), timeZoneTable),
    "deliveryTime": await getTime(get(data, `${process.env.SHIPMENT_HEADER_TABLE}[0].PODDateTime`, null), get(data, `${process.env.SHIPMENT_HEADER_TABLE}[0].PODDateTimeZone`, null), timeZoneTable),
    "podName": get(data, `${process.env.SHIPMENT_HEADER_TABLE}[0].PODName`, null),
    "serviceLevelCode": get(data, `${process.env.SHIPMENT_HEADER_TABLE}[0].FK_ServiceLevelId`, null),
    "serviceLevelDescription": get(data, `${process.env.SERVICE_LEVEL_TABLE}[0].ServiceLevel`, null),
    "customerReference": [
      {
        "refParty": await refParty(get(data, `${process.env.REFERENCE_TABLE}[0].CustomerType`, null)),
        //"refType": "hash",
        "refType": get(data, `${process.env.REFERENCE_TABLE}[0].FK_RefTypeId`, null),
        "refNumber": get(data, `${process.env.REFERENCE_TABLE}[0].ReferenceNo`, null)
        //"refNumber": "hash"
      }
    ],
    "milestones": [{
      "statusCode": get(data, `${process.env.SHIPMENT_MILESTONE_TABLE}[0].FK_OrderStatusId`, null),
      "statusDescription": get(data, `${process.env.MILESTONE_TABLE}[0].Description`, null),
      "statusTime": await getTime(get(data, `${process.env.SHIPMENT_MILESTONE_TABLE}[0].EventDateTime`, null), get(data, `${process.env.SHIPMENT_MILESTONE_TABLE}[0].EventTimeZone`, null), timeZoneTable)
    }],
    "locations": await locationFunc(get(data, `${process.env.SHIPMENT_HEADER_TABLE}[0].PK_OrderNo`, null), get(data, `${process.env.SHIPMENT_HEADER_TABLE}[0].Housebill`, null)),
    "EventDateTime": get(data, `${process.env.SHIPMENT_MILESTONE_TABLE}[0].EventDateTime`, null),
    "EventDate": moment(get(data, `${process.env.SHIPMENT_MILESTONE_TABLE}[0].EventDateTime`, null)).format("YYYY-MM-DD"),
    "OrderDateTime": get(data, `${process.env.SHIPMENT_HEADER_TABLE}[0].OrderDate`, null),
    "OrderDate": moment(get(data, `${process.env.SHIPMENT_HEADER_TABLE}[0].OrderDate`, null)).format("YYYY-MM-DD")
  }
  
  // const values = Object.values(payload);
  // const hasNullOrEmptyValue = values.some(value => value === null || value === '');
  // const status = hasNullOrEmptyValue ? 'Pending' : 'Ready';
  // payload.status = status;
  // return payload

  const ignoreFields = ['masterbill', 'pickupTime', 'estimatedDepartureTime', 'estimatedArrivalTime', 'scheduledDeliveryTime', 'deliveryTime', 'podName'];

  const values = Object.entries(payload).map(([key, value]) => {
    if (ignoreFields.includes(key)) {
      return true; // Ignore these fields when checking for empty or null values
    }
    return value;
  });

  const hasNullOrEmptyValue = values.some(value => value === null || value === '');

  const status = hasNullOrEmptyValue ? 'Pending' : 'Ready';
  payload.status = status;
  return payload;
}

async function upsertItem(tableName, item) {
  const houseBillNumber = item.HouseBillNumber;
  let params;

  try {
    const existingItem = await dynamodb.get({
      TableName: tableName,
      Key: {
        HouseBillNumber: houseBillNumber,
      },
    }).promise();


    if (existingItem.Item) {
      params = {
        TableName: tableName,
        Key: {
          HouseBillNumber: houseBillNumber,
        },
        UpdateExpression: 'SET #fileNumber = :fileNumber, #masterbill = :masterbill, #shipmentDate = :shipmentDate, #handlingStation = :handlingStation, #originPort = :originPort, #destinationPort = :destinationPort, #shipper = :shipper, #consignee = :consignee, #pieces = :pieces, #actualWeight = :actualWeight, #chargeableWeight = :chargeableWeight, #weightUOM = :weightUOM, #pickupTime = :pickupTime, #estimatedDepartureTime = :estimatedDepartureTime, #estimatedArrivalTime = :estimatedArrivalTime, #scheduledDeliveryTime = :scheduledDeliveryTime, #deliveryTime = :deliveryTime, #podName = :podName, #serviceLevelCode = :serviceLevelCode, #serviceLevelDescription = :serviceLevelDescription, #customerReference = :customerReference, #milestones = :milestones, #locations = :locations, #EventDateTime = :EventDateTime, #EventDate = :EventDate, #OrderDateTime = :OrderDateTime, #OrderDate = :OrderDate, #status = :status',
        ExpressionAttributeNames: {
          '#fileNumber': 'fileNumber',
          '#masterbill': 'masterbill',
          '#shipmentDate': 'shipmentDate',
          '#handlingStation': 'handlingStation',
          '#originPort': 'originPort',
          '#destinationPort': 'destinationPort',
          '#shipper': 'shipper',
          '#consignee': 'consignee',
          '#pieces': 'pieces',
          '#actualWeight': 'actualWeight',
          '#chargeableWeight': 'chargeableWeight',
          '#weightUOM': 'weightUOM',
          '#pickupTime': 'pickupTime',
          '#estimatedDepartureTime': 'estimatedDepartureTime',
          '#estimatedArrivalTime': 'estimatedArrivalTime',
          '#scheduledDeliveryTime': 'scheduledDeliveryTime',
          '#deliveryTime': 'deliveryTime',
          '#podName': 'podName',
          '#serviceLevelCode': 'serviceLevelCode',
          '#serviceLevelDescription': 'serviceLevelDescription',
          '#customerReference': 'customerReference',
          '#milestones': 'milestones',
          '#locations': 'locations',
          '#EventDateTime': 'EventDateTime',
          '#EventDate': 'EventDate',
          '#OrderDateTime': 'OrderDateTime',
          '#OrderDate': 'OrderDate',
          '#status': 'status',
        },
        ExpressionAttributeValues: {
          ':fileNumber': item.fileNumber,
          ':masterbill': item.masterbill,
          ':shipmentDate': item.shipmentDate,
          ':handlingStation': item.handlingStation,
          ':originPort': item.originPort,
          ':destinationPort': item.destinationPort,
          ':shipper': item.shipper,
          ':consignee': item.consignee,
          ':pieces': item.pieces,
          ':actualWeight': item.actualWeight,
          ':chargeableWeight': item.chargeableWeight,
          ':weightUOM': item.weightUOM,
          ':pickupTime': item.pickupTime,
          ':estimatedDepartureTime': item.estimatedDepartureTime,
          ':estimatedArrivalTime': item.estimatedArrivalTime,
          ':scheduledDeliveryTime': item.scheduledDeliveryTime,
          ':deliveryTime': item.deliveryTime,
          ':podName': item.podName,
          ':serviceLevelCode': item.serviceLevelCode,
          ':serviceLevelDescription': item.serviceLevelDescription,
          ':customerReference': item.customerReference,
          ':milestones': item.milestones,
          ':locations': item.locations,
          ':EventDateTime': item.EventDateTime,
          ':EventDate': item.EventDate,
          ':OrderDateTime': item.OrderDateTime,
          ':OrderDate': item.OrderDate,
          ':status': item.status,
        },
      };
      console.log("Updated")
      return await dynamodb.update(params).promise();
    } else {
      params = {
        TableName: tableName,
        Item: item,
      };
      console.log("inserted")
      return await dynamodb.put(params).promise();
    }
  } catch (e) {
    console.error("Put Item Error: ", e, "\nPut params: ", params);
    throw "PutItemError";
  }
}
