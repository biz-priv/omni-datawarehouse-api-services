// const AWS = require("aws-sdk");
// const { Converter } = AWS.DynamoDB;
// const dynamodb = new AWS.DynamoDB.DocumentClient();
// const ddb = new AWS.DynamoDB.DocumentClient();
// const { get } = require("lodash");

// const {refParty,pieces,actualWeight,ChargableWeight,weightUOM,getTime,locationFunc,getShipmentDate,getPickupTime,getDynamodbData,getDynamodbDataFromDateRange,} = require("../shared/commonFunctions/shipment_details");
// const {tableValues,weightDimensionValue,INDEX_VALUES,customerTypeValue,} = require("../../v2/shared/constants/shipment_details");

// module.exports.handler = async (event) => {
//   //console.log("event: ", event);

//   const unmarshalledData = Converter.unmarshall(
//     event.Records[0].dynamodb.NewImage
//   );
//   let orderNo = unmarshalledData.PK_OrderNo;
//   console.log("orderNo",orderNo)
//   let mainResponse = {};
//   let timeZoneTable = {};
//   const dynamodbData = {};
//   try {
//     const timeZoneTableParams = {
//       TableName: process.env.TIMEZONE_MASTER_TABLE,
//     };
//     const timeZoneTableResult = await ddb.scan(timeZoneTableParams).promise();
//     await Promise.all(
//       timeZoneTableResult.Items.map(async (item) => {
//         timeZoneTable[item.PK_TimeZoneCode] = item;
//       })
//     );

//     await Promise.all(
//       tableValues.map(async (tableValue) => {
//         let params = {
//           TableName: tableValue.tableName,
//           KeyConditionExpression: `#pKey = :pKey`,
//           ExpressionAttributeNames: {
//             "#pKey": tableValue.pKey,
//           },
//           ExpressionAttributeValues: {
//             ":pKey": orderNo,
//           },
//         };
//         if (tableValue.getValues) {
//           params.ProjectionExpression = tableValue.getValues;
//         }
//         const data = await ddb.query(params).promise();
//         dynamodbData[tableValue.tableName] = data.Items;
//       })
//     );

//     const PK_ServiceLevelId = get(dynamodbData,`${process.env.SHIPMENT_HEADER_TABLE}[0].FK_ServiceLevelId`,null);
//     console.log("PK_ServiceLevelId", PK_ServiceLevelId);
  
//     if (PK_ServiceLevelId != null || PK_ServiceLevelId != "") {
//       /*
//        *Dynamodb data from service level table
//        */
//       const servicelevelsTableParams = {
//         TableName: process.env.SERVICE_LEVEL_TABLE,
//         KeyConditionExpression: `#pKey = :pKey`,
//         ExpressionAttributeNames: {
//           "#pKey": "PK_ServiceLevelId",
//         },
//         ExpressionAttributeValues: {
//           ":pKey": PK_ServiceLevelId,
//         },
//       };
//       console.log("servicelevelsTableParams", servicelevelsTableParams);
//       const servicelevelsTableResult = await ddb.query(servicelevelsTableParams).promise();
//       dynamodbData[process.env.SERVICE_LEVEL_TABLE] =servicelevelsTableResult.Items;
//     }

//     const FK_ServiceLevelId = get(dynamodbData,`${process.env.SHIPMENT_MILESTONE_TABLE}[0].FK_ServiceLevelId`,null);
//     const FK_OrderStatusId = get(dynamodbData,`${process.env.SHIPMENT_MILESTONE_TABLE}[0].FK_OrderStatusId`,null);
//     console.log("FK_ServiceLevelId", FK_ServiceLevelId);
//     console.log("FK_OrderStatusId", FK_OrderStatusId);
  
//     if (FK_ServiceLevelId == null ||FK_ServiceLevelId == " " ||FK_ServiceLevelId == "" ||FK_OrderStatusId == null ||FK_OrderStatusId == "") {
//       console.log("no servicelevelId for ",get(dynamodbData,`${process.env.SHIPMENT_MILESTONE_TABLE}[0].FK_OrderNo `, null ));
//     } else {
//       /*
//        *Dynamodb data from milestone table
//        */
//       const milestoneTableParams = {
//         TableName: process.env.MILESTONE_TABLE,
//         KeyConditionExpression: `#pKey = :pKey and #sKey = :sKey`,
//         FilterExpression: "IsPublic = :IsPublic",
//         ExpressionAttributeNames: {
//           "#pKey": "FK_OrderStatusId",
//           "#sKey": "FK_ServiceLevelId",
//         },
//         ExpressionAttributeValues: {
//           ":pKey": FK_OrderStatusId,
//           ":sKey": FK_ServiceLevelId,
//           ":IsPublic": "Y",
//         },
//       };
//       //console.log("milestone params", milestoneTableParams);
//       const milestoneTableResult = await ddb.query(milestoneTableParams).promise();
//       console.log("milestoneTableResult", milestoneTableResult);
//       dynamodbData[process.env.MILESTONE_TABLE] = milestoneTableResult.Items;
//     }
//     console.log("dynamodb", dynamodbData);
    
//     mainResponse["shipmentDetailResponse"] = [];
//     mainResponse["shipmentDetailResponse"].push(
//       await parseAndMappingData(dynamodbData, timeZoneTable, true)
//     );
//     console.log("mainResponse", mainResponse);
  
//     await putItem(process.env.SHIPMENT_DETAILS_TABLE, {
//       ...mainResponse.shipmentDetailResponse[0],
//     });
//     console.log("inserted")

//   } catch (error) {
//     console.log("getDynamodbData: ", error);
//   }
// };

// async function parseAndMappingData(data, timeZoneTable, milestone_history) {
//   // console.log("inside data parsing function")
//   // console.log("data ====>",data)
//   const payload = {
//     "fileNumber": get(data, `${process.env.SHIPMENT_HEADER_TABLE}[0].PK_OrderNo`, null),
//     "HouseBillNumber": get(data, `${process.env.SHIPMENT_HEADER_TABLE}[0].Housebill`, null),
//     "masterbill": get(data, `${process.env.SHIPMENT_HEADER_TABLE}[0].MasterAirWaybill`, null),
//     "shipmentDate": await getShipmentDate(get(data, `${process.env.SHIPMENT_HEADER_TABLE}[0].ShipmentDateTime`, null)),
//     "handlingStation": get(data, `${process.env.SHIPMENT_HEADER_TABLE}[0].HandlingStation`, null),
//     "originPort": get(data, `${process.env.SHIPMENT_HEADER_TABLE}[0].OrgAirport`, null),
//     "destinationPort": get(data, `${process.env.SHIPMENT_HEADER_TABLE}[0].DestAirport`, null),
//     "shipper": {
//       "name": get(data, `${process.env.SHIPPER_TABLE}[0].ShipName`, null),
//       "address": get(data, `${process.env.SHIPPER_TABLE}[0].ShipAddress1`, null),
//       "city": get(data, `${process.env.SHIPPER_TABLE}[0].ShipCity`, null),
//       "state": get(data, `${process.env.SHIPPER_TABLE}[0].FK_ShipState`, null),
//       "zip": get(data, `${process.env.SHIPPER_TABLE}[0].ShipZip`, null),
//       "country": get(data, `${process.env.SHIPPER_TABLE}[0].FK_ShipCountry`, null)
//     },
//     "consignee": {
//       "name": get(data, `${process.env.CONSIGNEE_TABLE}[0].ConName`, null),
//       "address": get(data, `${process.env.CONSIGNEE_TABLE}[0].ConAddress1`, null),
//       "city": get(data, `${process.env.CONSIGNEE_TABLE}[0].ConCity`, null),
//       "state": get(data, `${process.env.CONSIGNEE_TABLE}[0].FK_ConState`, null),
//       "zip": get(data, `${process.env.CONSIGNEE_TABLE}[0].ConZip`, null),
//       "country": get(data, `${process.env.CONSIGNEE_TABLE}[0].FK_ConCountry`, null)
//     },
//     "pieces": await pieces(get(data, `${process.env.SHIPMENT_DESC_TABLE}`, null)),
//     "actualWeight": await actualWeight(get(data, `${process.env.SHIPMENT_DESC_TABLE}`, null)),
//     "chargeableWeight": await ChargableWeight(get(data, `${process.env.SHIPMENT_DESC_TABLE}`, null)),
//     "weightUOM": await weightUOM(get(data, `${process.env.SHIPMENT_DESC_TABLE}[0].WeightDimension`, null)),
//     "pickupTime": await getPickupTime(get(data, `${process.env.SHIPMENT_MILESTONE_DETAIL_TABLE}[0].EventDateTime`, null), get(data, `${process.env.SHIPMENT_MILESTONE_DETAIL_TABLE}[0].EventTimeZone`, null), timeZoneTable),
//     "estimatedDepartureTime": "",
//     "estimatedArrivalTime": await getTime(get(data, `${process.env.SHIPMENT_HEADER_TABLE}[0].ETADateTime`, null), get(data, `${process.env.SHIPMENT_HEADER_TABLE}[0].ETADateTimeZone`, null), timeZoneTable),
//     "scheduledDeliveryTime": await getTime(get(data, `${process.env.SHIPMENT_HEADER_TABLE}[0].ScheduledDateTime`, null), get(data, `${process.env.SHIPMENT_HEADER_TABLE}[0].ScheduledDateTimeZone`, null), timeZoneTable),
//     "deliveryTime": await getTime(get(data, `${process.env.SHIPMENT_HEADER_TABLE}[0].PODDateTime`, null), get(data, `${process.env.SHIPMENT_HEADER_TABLE}[0].PODDateTimeZone`, null), timeZoneTable),
//     "podName": get(data, `${process.env.SHIPMENT_HEADER_TABLE}[0].PODName`, null),
//     "serviceLevelCode": get(data, `${process.env.SHIPMENT_HEADER_TABLE}[0].FK_ServiceLevelId`, null),
//     "serviceLevelDescription": get(data, `${process.env.SERVICE_LEVEL_TABLE}[0].ServiceLevel`, null),
//     "customerReference": [
//       {
//         "refParty": await refParty(get(data, `${process.env.REFERENCE_TABLE}[0].CustomerType`, null)),
//         "refType": get(data, `${process.env.REFERENCE_TABLE}[0].FK_RefTypeId`, null),
//         "refNumber": get(data, `${process.env.REFERENCE_TABLE}[0].ReferenceNo`, null)
//       }
//     ],
//     "milestones": [{
//       "statusCode": get(data, `${process.env.SHIPMENT_MILESTONE_TABLE}[0].FK_OrderStatusId`, null),
//       "statusDescription": get(data, `${process.env.MILESTONE_TABLE}[0].Description`, null),
//       "statusTime": await getTime(get(data, `${process.env.SHIPMENT_MILESTONE_TABLE}[0].EventDateTime`, null), get(data, `${process.env.SHIPMENT_MILESTONE_TABLE}[0].EventTimeZone`, null), timeZoneTable)
//     }],
//     "locations": await locationFunc(get(data, `${process.env.SHIPMENT_HEADER_TABLE}[0].PK_OrderNo`, null), get(data, `${process.env.SHIPMENT_HEADER_TABLE}[0].Housebill`, null))
//   }

//   // if (milestone_history == true) {
//   //   const milestoneData = {
    
//   //   }
//   //   payload["milestones"] = milestoneData.milestones
//   // }
//   // // console.log("payload==>",payload)
//   return payload
// }


// // async function parseAndMappingData(data, timeZoneTable, milestone_history) {
// //   const payload = {
// //     fileNumber: get(data,`${process.env.SHIPMENT_HEADER_TABLE}[0].PK_OrderNo`, null),
// //     HouseBillNumber: get(data,`${process.env.SHIPMENT_HEADER_TABLE}[0].Housebill`, null),
// //     masterbill: get(data,`${process.env.SHIPMENT_HEADER_TABLE}[0].MasterAirWaybill`, null),
// //     shipmentDate: await getShipmentDate(get(data,`${process.env.SHIPMENT_HEADER_TABLE}[0].ShipmentDateTime`, null)),
// //     handlingStation: get( data,`${process.env.SHIPMENT_HEADER_TABLE}[0].HandlingStation`,null),
// //     originPort: get(data,`${process.env.SHIPMENT_HEADER_TABLE}[0].OrgAirport`,null),
// //     destinationPort: get(data,`${process.env.SHIPMENT_HEADER_TABLE}[0].DestAirport`,null),
// //     OrderDate: await getShipmentDate(get(data, `${process.env.SHIPMENT_HEADER_TABLE}[0].OrderDate`, null)),
// //     name: get(data, `${process.env.SHIPPER_TABLE}[0].ShipName`, null),
// //     address: get(data, `${process.env.SHIPPER_TABLE}[0].ShipAddress1`, null),
// //     city: get(data, `${process.env.SHIPPER_TABLE}[0].ShipCity`, null),
// //     state: get(data, `${process.env.SHIPPER_TABLE}[0].FK_ShipState`, null),
// //     zip: get(data, `${process.env.SHIPPER_TABLE}[0].ShipZip`, null),
// //     country: get(data, `${process.env.SHIPPER_TABLE}[0].FK_ShipCountry`, null),
// //     name: get(data, `${process.env.CONSIGNEE_TABLE}[0].ConName`, null),
// //     address: get(data, `${process.env.CONSIGNEE_TABLE}[0].ConAddress1`, null),
// //     city: get(data, `${process.env.CONSIGNEE_TABLE}[0].ConCity`, null),
// //     state: get(data, `${process.env.CONSIGNEE_TABLE}[0].FK_ConState`, null),
// //     zip: get(data, `${process.env.CONSIGNEE_TABLE}[0].ConZip`, null),
// //     country: get(data, `${process.env.CONSIGNEE_TABLE}[0].FK_ConCountry`, null),
// //     pieces: await pieces(get(data, `${process.env.SHIPMENT_DESC_TABLE}`, null)),
// //     actualWeight: await actualWeight(get(data, `${process.env.SHIPMENT_DESC_TABLE}`, null)),
// //     chargeableWeight: await ChargableWeight(get(data, `${process.env.SHIPMENT_DESC_TABLE}`, null)),
// //     weightUOM: await weightUOM(get(data, `${process.env.SHIPMENT_DESC_TABLE}[0].WeightDimension`, null)),
// //     pickupTime: await getPickupTime(get(data,`${process.env.SHIPMENT_MILESTONE_DETAIL_TABLE}[0].EventDateTime`,null),get(data,`${process.env.SHIPMENT_MILESTONE_DETAIL_TABLE}[0].EventTimeZone`,null),timeZoneTable),
// //     estimatedDepartureTime: "",
// //     estimatedArrivalTime: await getTime(get(data, `${process.env.SHIPMENT_HEADER_TABLE}[0].ETADateTime`, null),get(data,`${process.env.SHIPMENT_HEADER_TABLE}[0].ETADateTimeZone`,null),timeZoneTable),
// //     scheduledDeliveryTime: await getTime(get(data,`${process.env.SHIPMENT_HEADER_TABLE}[0].ScheduledDateTime`,null),get(data,`${process.env.SHIPMENT_HEADER_TABLE}[0].ScheduledDateTimeZone`,null),timeZoneTable),
// //     deliveryTime: await getTime(get(data, `${process.env.SHIPMENT_HEADER_TABLE}[0].PODDateTime`, null),get(data,`${process.env.SHIPMENT_HEADER_TABLE}[0].PODDateTimeZone`,null),timeZoneTable),
// //     podName: get(data, `${process.env.SHIPMENT_HEADER_TABLE}[0].PODName`, null),
// //     serviceLevelCode: get(data,`${process.env.SHIPMENT_HEADER_TABLE}[0].FK_ServiceLevelId`,null),
// //     serviceLevelDescription: get(data,`${process.env.SERVICE_LEVEL_TABLE}[0].ServiceLevel`,null),
// //     refParty: await refParty(get(data, `${process.env.REFERENCE_TABLE}[0].CustomerType`, null)),
// //     refType: get(data, `${process.env.REFERENCE_TABLE}[0].FK_RefTypeId`, null),
// //     refNumber: get(data, `${process.env.REFERENCE_TABLE}[0].ReferenceNo`, null),
// //     locations: await locationFunc(get(data, `${process.env.SHIPMENT_HEADER_TABLE}[0].PK_OrderNo`, null),get(data, `${process.env.SHIPMENT_HEADER_TABLE}[0].Housebill`, null)),
// //     EventDateTime: get(data,`${process.env.SHIPMENT_MILESTONE_TABLE}[0].EventDateTime`,null),
// //     statusCode: get( data,`${process.env.SHIPMENT_MILESTONE_TABLE}[0].FK_OrderStatusId`,null),
// //     statusDescription: get(data,`${process.env.MILESTONE_TABLE}[0].Description`,null),
// //     "statusTime": await getTime(get(data, `${process.env.SHIPMENT_MILESTONE_TABLE}[0].EventDateTime`, null), get(data, `${process.env.SHIPMENT_MILESTONE_TABLE}[0].EventTimeZone`, null), timeZoneTable)
// //   };
// //   return payload;
// // }

// async function putItem(tableName, item) {
//   let params;
//   try {
//     params = {
//       TableName: tableName,
//       Item: item,
//     };
//     return await dynamodb.put(params).promise();
//   } catch (e) {
//     console.error("Put Item Error: ", e, "\nPut params: ", params);
//     throw "PutItemError";
//   }
// }
// //////////////////////////////////////////////////////////////////////////////


// //const { tableValues }= require('../../v2/shared/constants/shipment_details');
// // const {
// //   refParty,
// //   pieces,
// //   actualWeight,
// //   ChargableWeight,
// //   weightUOM,
// //   getTime,
// //   locationFunc,
// //   getShipmentDate,
// //   getPickupTime,
// //   getDynamodbData,
// //   getDynamodbDataFromDateRange,
// // } = require("../shared/commonFunctions/shipment_details");
// // const {
// //   tableValues,
// //   weightDimensionValue,
// //   INDEX_VALUES,
// //   customerTypeValue,
// // } = require("../../v2/shared/constants/shipment_details");
// // console.log("tableValues::", tableValues);

// // module.exports.handler = async (event) => {
// //   console.log("event: ", event);
// //   let mainResponse = {};
// //   let timeZoneTable = {};
// //   const unmarshalledData = Converter.unmarshall(
// //     event.Records[0].dynamodb.NewImage
// //   );
// //   let orderNo = unmarshalledData.PK_OrderNo;
// //   console.log("unmarshalledData.PK_OrderNo", unmarshalledData.PK_OrderNo);
// //   const dynamodbData = {};

// //   const timeZoneTableParams = {
// //     TableName: process.env.TIMEZONE_MASTER_TABLE,
// //   };
// //   const timeZoneTableResult = await ddb.scan(timeZoneTableParams).promise();
// //   await Promise.all(
// //     timeZoneTableResult.Items.map(async (item) => {
// //       timeZoneTable[item.PK_TimeZoneCode] = item;
// //     })
// //   );

// //   await Promise.all(
// //     tableValues.map(async (tableValue) => {
// //       // console.log(tableValue)
// //       let params = {
// //         TableName: tableValue.tableName,
// //         KeyConditionExpression: `#pKey = :pKey`,
// //         ExpressionAttributeNames: {
// //           "#pKey": tableValue.pKey,
// //         },
// //         ExpressionAttributeValues: {
// //           ":pKey": orderNo,
// //         },
// //       };
// //       if (tableValue.getValues) {
// //         params.ProjectionExpression = tableValue.getValues;
// //       }
// //       //console.log(params)
// //       const data = await ddb.query(params).promise();
// //       dynamodbData[tableValue.tableName] = data.Items;
// //       //console.log("dynamodbData",dynamodbData)
// //     })
// //   );
// //   //console.log("dynamodb", dynamodbData);
// //   console.log("after tables from constant values");

// //   const PK_ServiceLevelId = get(
// //     dynamodbData,
// //     `${process.env.SHIPMENT_HEADER_TABLE}[0].FK_ServiceLevelId`,
// //     null
// //   );
// //   console.log("PK_ServiceLevelId", PK_ServiceLevelId);

// //   if (PK_ServiceLevelId != null || PK_ServiceLevelId != "") {
// //     /*
// //      *Dynamodb data from service level table
// //      */
// //     const servicelevelsTableParams = {
// //       TableName: process.env.SERVICE_LEVEL_TABLE,
// //       KeyConditionExpression: `#pKey = :pKey`,
// //       ExpressionAttributeNames: {
// //         "#pKey": "PK_ServiceLevelId",
// //       },
// //       ExpressionAttributeValues: {
// //         ":pKey": PK_ServiceLevelId,
// //       },
// //     };
// //     console.log("servicelevelsTableParams", servicelevelsTableParams);
// //     const servicelevelsTableResult = await ddb
// //       .query(servicelevelsTableParams)
// //       .promise();
// //     dynamodbData[process.env.SERVICE_LEVEL_TABLE] =
// //       servicelevelsTableResult.Items;
// //   }
// //   console.log("after service level table");

// //   const FK_ServiceLevelId = get(
// //     dynamodbData,
// //     `${process.env.SHIPMENT_MILESTONE_TABLE}[0].FK_ServiceLevelId`,
// //     null
// //   );
// //   const FK_OrderStatusId = get(
// //     dynamodbData,
// //     `${process.env.SHIPMENT_MILESTONE_TABLE}[0].FK_OrderStatusId`,
// //     null
// //   );
// //   console.log("FK_ServiceLevelId", FK_ServiceLevelId);
// //   console.log("FK_OrderStatusId", FK_OrderStatusId);

// //   if (
// //     FK_ServiceLevelId == null ||
// //     FK_ServiceLevelId == " " ||
// //     FK_ServiceLevelId == "" ||
// //     FK_OrderStatusId == null ||
// //     FK_OrderStatusId == ""
// //   ) {
// //     console.log(
// //       "no servicelevelId for ",
// //       get(
// //         dynamodbData,
// //         `${process.env.SHIPMENT_MILESTONE_TABLE}[0].FK_OrderNo

// //         `,
// //         null
// //       )
// //     );
// //   } else {
// //     /*
// //      *Dynamodb data from milestone table
// //      */
// //     const milestoneTableParams = {
// //       TableName: process.env.MILESTONE_TABLE,
// //       KeyConditionExpression: `#pKey = :pKey and #sKey = :sKey`,
// //       FilterExpression: "IsPublic = :IsPublic",
// //       ExpressionAttributeNames: {
// //         "#pKey": "FK_OrderStatusId",
// //         "#sKey": "FK_ServiceLevelId",
// //       },
// //       ExpressionAttributeValues: {
// //         ":pKey": FK_OrderStatusId,
// //         ":sKey": FK_ServiceLevelId,
// //         ":IsPublic": "Y",
// //       },
// //     };
// //     console.log("milestone params", milestoneTableParams);
// //     const milestoneTableResult = await ddb
// //       .query(milestoneTableParams)
// //       .promise();
// //     console.log("milestoneTableResult", milestoneTableResult);
// //     dynamodbData[process.env.MILESTONE_TABLE] = milestoneTableResult.Items;
// //   }
// //   console.log("dynamodb", dynamodbData);

// //   mainResponse["shipmentDetailResponse"] = [];
// //   mainResponse["shipmentDetailResponse"].push(
// //     await parseAndMappingData(dynamodbData, timeZoneTable, true)
// //   );
// //   console.log("mainResponse", mainResponse);

// //   // await putItem(process.env.SHIPMENT_DETAILS_TABLE, {
// //   //   ...mainResponse.shipmentDetailResponse[0],
// //   // });
// //   // console.log("inserted")
// //   /*
// //    *Dynamodb data from shipment milestone detail table
// //    */
// //   // const shipmentMilestonedetailTableParams = {
// //   //   TableName: process.env.SHIPMENT_MILESTONE_DETAIL_TABLE,
// //   //   KeyConditionExpression: `#pKey = :pKey and #sKey = :sKey`,
// //   //   ExpressionAttributeNames: {
// //   //     "#pKey": "FK_OrderNo",
// //   //     "#sKey": "FK_OrderStatusId"
// //   //   },
// //   //   ExpressionAttributeValues: {
// //   //     ":pKey": fileNumber,
// //   //     ":sKey": "PUP"
// //   //   },
// //   // }
// //   // // console.log(shipmentMilestonedetailTableParams)
// //   // const shipmentMilestonedetailTableResult = await ddb.query(shipmentMilestonedetailTableParams).promise();
// //   // shipmentMilestonedetailTableResult.Items.sort(
// //   //   (a, b) =>
// //   //     new Date(a.EventDateTime) - new Date(b.EventDateTime)
// //   // );
// //   // // console.log("results", shipmentMilestonedetailTableResult)
// //   // dynamodbData[process.env.SHIPMENT_MILESTONE_DETAIL_TABLE] = shipmentMilestonedetailTableResult.Items
// // };


const AWS = require("aws-sdk");
const { Converter } = AWS.DynamoDB;
const dynamodb = new AWS.DynamoDB.DocumentClient();
const ddb = new AWS.DynamoDB.DocumentClient();
const { get } = require("lodash");


const pkeys = {
  "omni-wt-rt-shipment-header": "pk_orderNo"
}
module.exports.handler = async (event) => {
  console.log("event: ", JSON.stringify(event));
    const unmarshalledData = Converter.unmarshall(
    event.Records[0].dynamodb.NewImage
  );
  console.log("table name",(event.Records[0].eventSourceARN.split("/"))[1])
  const table = (event.Records[0].eventSourceARN.split("/"))[1];
  const tablearr = table.split("-")
  tablearr.pop()
  const tableName = tablearr.join("-")
  console.log("table name:  ",tableName)
  console.log("pkey: ", pkeys[tableName])
  console.log(unmarshalledData);
  return {
    message: "ss",
  };
};
