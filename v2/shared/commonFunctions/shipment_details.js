const AWS = require("aws-sdk");
const moment = require('moment');
const { get } = require('lodash');
const ddb = new AWS.DynamoDB.DocumentClient();

const tracking_notes_table = process.env.TRACKING_NOTES_TABLE

const { tableValues, weightDimensionValue, INDEX_VALUES, customerTypeValue } = require("../constants/shipment_details");
// const { parseAndMappingData } = require("../dataParser/shipmentDetailsDataParser");

async function refParty(customerType) {
  try {
    let refParty = get(customerTypeValue, `${customerType}`, null)
    if (refParty == null) {
      refParty = get(customerTypeValue, "default", null)
    }
    return refParty;
  } catch (error) {
    throw error
  }
}
async function pieces(tableValue) {
  try {
    let pieces = 0
    await Promise.all(tableValue.map(async (val) => {
      pieces += val.Pieces
    }))
    return Number(pieces);
  } catch (error) {
    throw error
  }
}
async function actualWeight(tableValue) {
  try {
    let actualWeight = 0
    await Promise.all(tableValue.map(async (val) => {
      actualWeight += val.Weight
    }))
    return Number(actualWeight);
  } catch (error) {
    throw error
  }
}
async function ChargableWeight(tableValue) {
  try {
    let ChargableWeight = 0
    await Promise.all(tableValue.map(async (val) => {
      ChargableWeight += val.ChargableWeight
    }))
    return Number(ChargableWeight);
  } catch {
    throw error
  }
}
async function weightUOM(weightDimension) {
  try {
    let weightUOM = get(weightDimensionValue, `${weightDimension}`, null)
    if (weightUOM == null) {
      weightUOM = get(weightDimensionValue, "default", null)
    }
    return weightUOM;
  } catch (error) {
    throw error
  }
}

async function getPickupTime(dateTime, dateTimeZone, timeZoneTable) {
  try {
    const result = await getTime(dateTime, dateTimeZone, timeZoneTable)
    // console.log("pick up time====>", result)
    if (result == 0 || result == null || result == "" || result.substring(0, 4) == "1900") {
      return ""
    }
    return result
  } catch (error) {
    throw error
  }
}

async function getTime(dateTime, dateTimeZone, timeZoneTable) {
  try {
    const inputDate = moment(dateTime);
    if (dateTimeZone == "" || dateTimeZone == null) {
      dateTimeZone = "CST"
    }
    const weekNumber = inputDate.isoWeek();
    inputDate.subtract(Number(timeZoneTable[dateTimeZone].HoursAway), 'hours');
    let convertedDate = inputDate.format('YYYY-MM-DDTHH:mm:ss');
    if (weekNumber < 0 && weekNumber > 52) {
      console.log("wrong week number");
    } else if (weekNumber > 11 && weekNumber < 44) {
      convertedDate = convertedDate + "-05:00";
    } else {
      convertedDate = convertedDate + "-06:00";
    }
    return convertedDate;
  } catch (error) {
    throw error
  }
}

async function locationFunc(pKeyValue, houseBill) {
  try {
    let mainArray = []
    let params = {
      TableName: process.env.TRACKING_NOTES_TABLE,
      IndexName: INDEX_VALUES.TRACKING_NOTES.INDEX,
      KeyConditionExpression: "FK_OrderNo = :orderNo",
      FilterExpression: 'FK_UserId = :FK_UserId',
      ExpressionAttributeValues: {
        ":orderNo": pKeyValue,
        ":FK_UserId": "macropt"
      }
    };
    const data = await ddb.query(params).promise();
    if (data.Items.length !== 0) {
      const trackingNotesLocation = await trackingNotesDataParse(data.Items[0])
      mainArray.push(trackingNotesLocation)
    }
    let locationParams = {
      TableName: "omni-p44-shipment-location-updates-dev",
      KeyConditionExpression: "HouseBillNo = :HouseBillNo",
      ExpressionAttributeValues: {
        ":HouseBillNo": houseBill
      }
    }
    const locationdata = await ddb.query(locationParams).promise();
    await Promise.all(locationdata.Items.map(async (item) => {
      const itemArray = [item.UTCTimeStamp, item.longitude, item.latitude]
      mainArray.push(itemArray)
    }))
    return mainArray;
  } catch (error) {
    throw error
  }
}

async function trackingNotesDataParse(item) {
  try {
    // console.log(item)
    const note = item.Note
    const parseArray = note.split(" ")
    const latitude = parseArray[2].split("=")[1]
    const longitute = parseArray[3].split("=")[1]
    return [item.EventDateTime, latitude, longitute]
  } catch (error) {
    throw error
  }
}

async function getShipmentDate(dateTime) {
  try {
    // console.log("shipment date time", dateTime)
    if (dateTime == 0 || dateTime == null) {
      return ""
    } else {
      // console.log(dateTime.substring(0, 10))
      return dateTime.substring(0, 10)
    }
  } catch (error) {
    throw error
  }
}

async function getDynamodbData(eventType, value) {
  // console.log(eventType, value)
  let timeZoneTable = {};
  const dynamodbData = {};
  let fileNumber;
  try {
    if (eventType == "housebill") {
      let params = {
        TableName: process.env.SHIPMENT_HEADER_TABLE,
        IndexName: "Housebill-index",
        KeyConditionExpression: "Housebill = :Housebill",
        ExpressionAttributeValues: {
          ":Housebill": value,
        }
      };
      console.log(params)
      const data = await ddb.query(params).promise();
      console.log(data)
      fileNumber = data.Items[0].PK_OrderNo
      dynamodbData[process.env.SHIPMENT_HEADER_TABLE] = data.Items
    } else {
      fileNumber = value
      let params = {
        TableName: process.env.SHIPMENT_HEADER_TABLE,
        KeyConditionExpression: `#pKey = :pKey`,
        ExpressionAttributeNames: {
          "#pKey": "PK_OrderNo",
        },
        ExpressionAttributeValues: {
          ":pKey": fileNumber,
        },
      };
      // console.log(params)
      const data = await ddb.query(params).promise();
      dynamodbData[process.env.SHIPMENT_HEADER_TABLE] = data.Items
    }

    const timeZoneTableParams = {
      TableName: process.env.TIMEZONE_MASTER_TABLE,
    };
    const timeZoneTableResult = await ddb.scan(timeZoneTableParams).promise();
    await Promise.all(timeZoneTableResult.Items.map(async (item) => {
      timeZoneTable[item.PK_TimeZoneCode] = item
    }))

    await Promise.all(
      tableValues.map(async (tableValue) => {
        // console.log(tableValue)
        let params = {
          TableName: tableValue.tableName,
          KeyConditionExpression: `#pKey = :pKey`,
          ExpressionAttributeNames: {
            "#pKey": tableValue.pKey,
          },
          ExpressionAttributeValues: {
            ":pKey": fileNumber,
          },
        };
        if (tableValue.getValues) {
          params.ProjectionExpression = tableValue.getValues
        }
        // console.log(params)
        const data = await ddb.query(params).promise();
        dynamodbData[tableValue.tableName] = data.Items
      })
    );
    // console.log("dynamodb", dynamodbData)
    const PK_ServiceLevelId = get(dynamodbData, `${process.env.SHIPMENT_HEADER_TABLE}[0].FK_ServiceLevelId`, null)
    if (PK_ServiceLevelId != null || PK_ServiceLevelId != "") {
      const servicelevelsTableParams = {
        TableName: process.env.SERVICE_LEVEL_TABLE,
        KeyConditionExpression: `#pKey = :pKey`,
        ExpressionAttributeNames: {
          "#pKey": "PK_ServiceLevelId",
        },
        ExpressionAttributeValues: {
          ":pKey": PK_ServiceLevelId,
        },
      }
      const servicelevelsTableResult = await ddb.query(servicelevelsTableParams).promise();
      dynamodbData[process.env.SERVICE_LEVEL_TABLE] = servicelevelsTableResult.Items
    }


    const FK_ServiceLevelId = get(dynamodbData, `${process.env.SHIPMENT_MILESTONE_TABLE}[0].FK_ServiceLevelId`, null)
    const FK_OrderStatusId = get(dynamodbData, `${process.env.SHIPMENT_MILESTONE_TABLE}[0].FK_OrderStatusId`, null)
    if (FK_ServiceLevelId == null || FK_ServiceLevelId == ' ' || FK_ServiceLevelId == '' || FK_OrderStatusId == null || FK_OrderStatusId == "") {
      console.log("no servicelevelId for ", get(dynamodbData, `${process.env.SHIPMENT_MILESTONE_TABLE}[0].FK_OrderNo
      
      `, null))
    }else{
      const milestoneTableParams = {
        TableName: process.env.MILESTONE_TABLE,
        KeyConditionExpression: `#pKey = :pKey and #sKey = :sKey`,
        FilterExpression: 'IsPublic = :IsPublic',
        ExpressionAttributeNames: {
          "#pKey": "FK_OrderStatusId",
          "#sKey": "FK_ServiceLevelId"
        },
        ExpressionAttributeValues: {
          ":pKey": FK_OrderStatusId,
          ":sKey": FK_ServiceLevelId,
          ":IsPublic": 'Y'
        },
      }
      // console.log("milestone params", milestoneTableParams)
      const milestoneTableResult = await ddb.query(milestoneTableParams).promise();
      // console.log("milestone", milestoneTableResult)
      dynamodbData[process.env.MILESTONE_TABLE] = milestoneTableResult.Items
    }


    const shipmentMilestonedetailTableParams = {
      TableName: process.env.SHIPMENT_MILESTONE_DETAIL_TABLE,
      KeyConditionExpression: `#pKey = :pKey and #sKey = :sKey`,
      ExpressionAttributeNames: {
        "#pKey": "FK_OrderNo",
        "#sKey": "FK_OrderStatusId"
      },
      ExpressionAttributeValues: {
        ":pKey": get(dynamodbData, `${process.env.SHIPMENT_MILESTONE_TABLE}[0].FK_OrderNo`, null),
        ":sKey": "PUP"
      },
    }
    // console.log(shipmentMilestonedetailTableParams)
    const shipmentMilestonedetailTableResult = await ddb.query(shipmentMilestonedetailTableParams).promise();
    shipmentMilestonedetailTableResult.Items.sort(
      (a, b) =>
        new Date(a.EventDateTime) - new Date(b.EventDateTime)
    );
    // console.log("results", shipmentMilestonedetailTableResult)
    dynamodbData[process.env.SHIPMENT_MILESTONE_DETAIL_TABLE] = shipmentMilestonedetailTableResult.Items
    // console.log("final dynamodb data", dynamodbData)
    // console.log("end of the getDynamodb func", value)
    return { "dynamodbData": dynamodbData, "timeZoneTable": timeZoneTable }
  } catch (error) {
    console.log("getDynamodbData: ", error)
    return { "dynamodbData": {}, "timeZoneTable": {} }
  }
}

async function getDynamodbDataFromDateRange(eventType, fromDate, toDate) {
  try {
    let dynamodbData = {};
    let timeZoneTable = {};
    let mainResponse = {};
    let fileNumberArray = [];
    if (eventType == "activityDate") {
      let completeValue = ["Y", "N"]
      await Promise.all(completeValue.map(async (pKeyValue) => {
        let params = {
          TableName: process.env.SHIPMENT_MILESTONE_TABLE,
          IndexName: "Complete-index-dev",
          KeyConditionExpression: "#Complete = :Complete and EventDateTime BETWEEN :start AND :end",
          ExpressionAttributeNames: {
            "#Complete": "Complete"
          },
          ExpressionAttributeValues: {
            ":Complete": pKeyValue,
            ":start": fromDate,
            ":end": toDate
          }
        };
        console.log("params of shipment milestone table", params)
        const data = await ddb.query(params).promise();
        console.log("data from shipment milestone", pKeyValue, data)
        if (data.Items.length != 0) {
          await Promise.all(data.Items.map(async (item) => {
            // console.log("file number", item.FK_OrderNo)
            // console.log("fileNumberArray", fileNumberArray)
            fileNumberArray.push(item?.FK_OrderNo)
            const data1 = await getDynamodbData("fileNumber", item.FK_OrderNo)
            dynamodbData = data1.dynamodbData
            timeZoneTable = data1.timeZoneTable
            // console.log(dynamodbData)
            mainResponse["shipmentDetailResponse"] = []
            const parsedData = await parseAndMappingData(dynamodbData, timeZoneTable, true)
            // console.log("parsedData", parsedData)
            mainResponse["shipmentDetailResponse"].push(parsedData)
          }))
        }
        // console.log(fileNumberArray)
      }))
    } else {
      const timeZoneTableParams = {
        TableName: process.env.TIMEZONE_MASTER_TABLE,
      };
      const timeZoneTableResult = await ddb.scan(timeZoneTableParams).promise();
      console.log(timeZoneTableResult.Items)
      await Promise.all(timeZoneTableResult.Items.map(async (item) => {
        let params = {
          TableName: process.env.SHIPMENT_MILESTONE_TABLE,
          IndexName: "PODDateTimeZone-index-dev",
          KeyConditionExpression: "#PODDateTimeZone = :PODDateTimeZone and OrderDate BETWEEN :start AND :end",
          ExpressionAttributeNames: {
            "#PODDateTimeZone": "PODDateTimeZone"
          },
          ExpressionAttributeValues: {
            ":PODDateTimeZone": item.PK_TimeZoneCode,
            ":start": fromDate,
            ":end": toDate
          }
        }
        console.log("params of shipment header table", params)
        const data = await ddb.query(params).promise();
        console.log("data from shipment header", pKeyValue, data)
        await Promise.all(data.Items.map(async (item) => {
          fileNumberArray.push(item?.FK_OrderNo)
          const data1 = await getDynamodbData("fileNumber", item.FK_OrderNo)
          dynamodbData = data1.dynamodbData
          timeZoneTable = data1.timeZoneTable
          // console.log(dynamodbData)
          mainResponse["shipmentDetailResponse"] = []
          const parsedData = await parseAndMappingData(dynamodbData, timeZoneTable, true)
          // console.log("parsedData", parsedData)
          mainResponse["shipmentDetailResponse"].push(parsedData)
        }))
        PK_OrderNo
      }))
    }
    // console.log(fileNumberArray)
    // console.log("final main Response ===>",mainResponse)
    return mainResponse
  } catch (error) {
    console.log("date range function: ", error)
  }
}

async function parseAndMappingData(data, timeZoneTable, milestone_history) {
  // console.log("inside data parsing function")
  // console.log("data ====>",data)
  const payload = {
    "fileNumber": get(data, `${process.env.SHIPMENT_HEADER_TABLE}[0].PK_OrderNo`, null),
    "housebill": get(data, `${process.env.SHIPMENT_HEADER_TABLE}[0].Housebill`, null),
    "masterbill": get(data, `${process.env.SHIPMENT_HEADER_TABLE}[0].MasterAirWaybill`, null),
    "shipmentDate": await getShipmentDate(get(data, `${process.env.SHIPMENT_HEADER_TABLE}[0].ShipmentDateTime`, null)),
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
    "actualWeight": await actualWeight(get(data, `${process.env.SHIPMENT_DESC_TABLE}`, null)),
    "chargeableWeight": await ChargableWeight(get(data, `${process.env.SHIPMENT_DESC_TABLE}`, null)),
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
        "refType": get(data, `${process.env.REFERENCE_TABLE}[0].FK_RefTypeId`, null),
        "refNumber": get(data, `${process.env.REFERENCE_TABLE}[0].ReferenceNo`, null)
      }
    ],
    "locations": await locationFunc(get(data, `${process.env.SHIPMENT_HEADER_TABLE}[0].PK_OrderNo`, null), get(data, `${process.env.SHIPMENT_HEADER_TABLE}[0].Housebill`, null))
  }

  if (milestone_history == true) {
    const milestoneData = {
      "milestones": [{
        "statusCode": get(data, `${process.env.SHIPMENT_MILESTONE_TABLE}[0].FK_OrderStatusId`, null),
        "statusDescription": get(data, `${process.env.MILESTONE_TABLE}[0].Description`, null),
        "statusTime": await getTime(get(data, `${process.env.SHIPMENT_MILESTONE_TABLE}[0].EventDateTime`, null), get(data, `${process.env.SHIPMENT_MILESTONE_TABLE}[0].EventTimeZone`, null), timeZoneTable)
      }]
    }
    payload["milestones"] = milestoneData.milestones
  }
  // console.log("payload==>",payload)
  return payload
}


module.exports = { refParty, pieces, actualWeight, ChargableWeight, weightUOM, getTime, locationFunc, getShipmentDate, getPickupTime, getDynamodbData, getDynamodbDataFromDateRange, parseAndMappingData }