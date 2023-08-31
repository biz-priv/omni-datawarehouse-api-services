const AWS = require("aws-sdk");
const ddb = new AWS.DynamoDB.DocumentClient();
const moment = require('moment');

const { get } = require('lodash');
// const { parseAndMappingData } = require("../shared/dataParser/shipmentDetailsDataParser");
const Joi = require("joi");
const { getDynamodbData, getDynamodbDataFromDateRange, parseAndMappingData } = require("../shared/commonFunctions/shipment_details");
const sns = new AWS.SNS();

const shipment_header_table = process.env.SHIPMENT_HEADER_TABLE
const shipper_table = process.env.SHIPPER_TABLE
const consignee_table = process.env.CONSIGNEE_TABLE
const shipment_desc_table = process.env.SHIPMENT_DESC_TABLE
const reference_table = process.env.REFERENCE_TABLE
const shipment_milestone_table = process.env.SHIPMENT_MILESTONE_TABLE
const tracking_notes_table_indexValue = process.env.TRACKING_NOTES_TABLE_INDEXVALUE
const timezone_master_table = process.env.TIMEZONE_MASTER_TABLE
const service_level_table = process.env.SERVICE_LEVEL_TABLE
const milestone_table = process.env.MILESTONE_TABLE
const shipment_milestone_detail_table = process.env.SHIPMENT_MILESTONE_DETAIL_TABLE
const tracking_notes_table = process.env.TRACKING_NOTES_TABLE




module.exports.handler = async (event) => {
  console.log("event: ", event)
  // const eventBody = JSON.parse(event)
  // console.log("query string ", event.queryStringParameters)
  let timeZoneTable = {};
  let dynamodbData = {};
  let mainResponse = {};


  try {

    // const pKeyValue = "1787176";
    if (event.queryStringParameters) {
      if (event.queryStringParameters.hasOwnProperty("fileNumber")) {
        ({ dynamodbData, timeZoneTable } = await getDynamodbData("fileNumber", event.queryStringParameters.fileNumber))
        mainResponse["shipmentDetailResponse"] = []
        mainResponse["shipmentDetailResponse"].push(await parseAndMappingData(dynamodbData, timeZoneTable, true))
      } else if (event.queryStringParameters.hasOwnProperty("housebill")) {
        ({ dynamodbData, timeZoneTable } = await getDynamodbData("housebill", event.queryStringParameters.housebill))
        console.log("final dynamodb data ", dynamodbData)
        console.log("timeZoneTable", timeZoneTable)
        if (event.queryStringParameters.hasOwnProperty("milestone_history")) {
          mainResponse["shipmentDetailResponse"] = []
          mainResponse["shipmentDetailResponse"].push(await parseAndMappingData(dynamodbData, timeZoneTable, event.queryStringParameters.milestone_history))
        } else {
          mainResponse["shipmentDetailResponse"] = []
          mainResponse["shipmentDetailResponse"].push(await parseAndMappingData(dynamodbData, timeZoneTable, true))
        }
      } else if (event.queryStringParameters.hasOwnProperty("activityFromDate") && event.queryStringParameters.hasOwnProperty("activityToDate")) {
        const fromDate = moment(event.queryStringParameters.activityFromDate, 'YYYY-MM-DD HH:mm:ss.SSS');
        const toDate = moment(event.queryStringParameters.activityToDate, 'YYYY-MM-DD HH:mm:ss.SSS');

        const daysDifference = toDate.diff(fromDate, 'days');
        if (daysDifference < 0) {
          console.log("activityToDate cannot be earlier than activityFromDate")
          throw "activityToDate cannot be earlier than activityFromDate"
        } else if (daysDifference > 7) {
          console.log(`date range cannot be more than 7days \n your date range ${daysDifference}`)
          throw `date range cannot be more than 7days \n your date range ${daysDifference}`
        } else if (daysDifference == 0) {
          const hoursDiff = toDate.diff(fromDate, 'hours');
          if (hoursDiff < 0) {
            console.log("activityToDate cannot be earlier than activityFromDate")
            throw "activityToDate cannot be earlier than activityFromDate"
          }
        }
        console.log(daysDifference)
        mainResponse = await getDynamodbDataFromDateRange("activityDate", event.queryStringParameters.activityFromDate, event.queryStringParameters.activityToDate)
      } else if (event.queryStringParameters.hasOwnProperty("shipmentFromDate") && event.queryStringParameters.hasOwnProperty("shipmentToDate")) {
        const fromDate = moment(event.queryStringParameters.shipmentFromDate, 'YYYY-MM-DD HH:mm:ss.SSS');
        const toDate = moment(event.queryStringParameters.shipmentToDate, 'YYYY-MM-DD HH:mm:ss.SSS');

        const daysDifference = toDate.diff(fromDate, 'days');
        if (daysDifference < 0) {
          console.log("shipmentToDate cannot be earlier than shipmentFromDate")
          throw "shipmentToDate cannot be earlier than shipmentFromDate"
        } else if (daysDifference > 7) {
          console.log(`date range cannot be more than 7days \n your date range: ${daysDifference}`)
          throw `date range cannot be more than 7days \n your date range: ${daysDifference}`
        } else if (daysDifference == 0) {
          const hoursDiff = toDate.diff(fromDate, 'hours');
          if (hoursDiff < 0) {
            console.log("shipmentToDate cannot be earlier than shipmentFromDate")
            throw "shipmentToDate cannot be earlier than shipmentFromDate"
          }
        }
        console.log(daysDifference)
        mainResponse = await getDynamodbDataFromDateRange("shipmentDate", event.queryStringParameters.shipmentFromDate, event.queryStringParameters.shipmentToDate)
      } else {
        console.log("Required any of the fields: fileNumber/housebill/shipmentFromDate and shipmentToDate/activityFromDate and activityToDate")
        throw "Required any of the fields: fileNumber/housebill/shipmentFromDate and shipmentToDate/activityFromDate and activityToDate"
      }
    } else {
      console.log("Required any of the fields: fileNumber/housebill/shipmentFromDate and shipmentToDate/activityFromDate and activityToDate")
      throw "Required any of the fields: fileNumber/housebill/shipmentFromDate and shipmentToDate/activityFromDate and activityToDate"
    }


    console.log(mainResponse.shipmentDetailResponse.length)
    return {
      statusCode: 200,
      body:
        JSON.stringify({
          message: mainResponse
        })
    };

  } catch (error) {
    console.log("in main function: \n", error)

    // const params = {
    //   Message: `Shipment details api Error: \n ${error}`, // The message you want to send
    //   TopicArn: 'YOUR_TOPIC_ARN' // The ARN (Amazon Resource Name) of your SNS topic
    // };
    // sns.publish(params, function (err, data) {
    //   if (err) {
    //     console.log('Error sending message:', err);
    //   } else {
    //     console.log('Message sent:', data.MessageId);
    //   }
    // })
    return {
      statusCode: 400,
      body:
        JSON.stringify({
          message: `error: \n ${error}`
        })
    }
  }


};


