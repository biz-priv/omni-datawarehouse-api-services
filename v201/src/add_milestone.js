const axios = require("axios");
const { convert } = require("xmlbuilder2");
const Joi = require("joi");
const AWS = require('aws-sdk');
var dynamodb = new AWS.DynamoDB.DocumentClient();
const s3 = new AWS.S3();
const { v4: uuidv4 } = require("uuid");
const momentTZ = require("moment-timezone");

const {
  SHIPMENT_APAR_TABLE,
  SHIPMENT_HEADER_TABLE,
  ADDRESS_MAPPING_TABLE,
  MILESTONE_LOG_TABLE,
  MILESTONE_ORDER_STATUS,
  IVIA_VENDOR_ID,
} = process.env;

const statusCodes = MILESTONE_ORDER_STATUS.split(",");
console.log(statusCodes);

const statusCodeValidation = Joi.string()
  .alphanum()
  .required()
  .valid(...statusCodes);

const eventValidation = Joi.object()
.keys({
  addMilestoneRequest: Joi.object()
    .keys({
      housebill: Joi.string().alphanum().required(),
      statusCode: statusCodeValidation,
      eventTime: Joi.string().required(),
    })
    .required(),
})
.required();

const eventDeliveredValidation = Joi.object()
  .keys({
    addMilestoneRequest: Joi.object()
      .keys({
        housebill: Joi.string().required(),
        statusCode: statusCodeValidation,
        eventTime: Joi.string().required(),
        latitude: Joi.number(),
        longitude: Joi.number(),
        signatory: Joi.string().required(),
      })
      .required(),
  })
  .required();

  const eventLocationValidation = Joi.object()
  .keys({
    addMilestoneRequest: Joi.object()
      .keys({
        housebill: Joi.string().required(),
        statusCode: statusCodeValidation,
        eventTime: Joi.string().required(),
        latitude: Joi.number().required(),
        longitude: Joi.number().required(),
        signatory: Joi.string(),
      })
      .required(),
  })
  .required();


const statusCodeSchema = Joi.object({
  addMilestoneRequest: Joi.object({
    housebill: Joi.string().required(),
    statusCode: Joi.string().valid("CAN").required(),
    eventTime: Joi.string(),
  }),
});

let eventLogObj = {
  Id: "",
  createdAt: "",
  housebill: "",
  statusCode: "",
  latitude: "",
  longitude: "",
  eventTime: "",
  signatory: "",
  payload: "",
  sentPayload: "",
  xmlPayload: "",
  xmlResponse: "",
  FK_OrderNo: "",
  FK_ServiceId: "",
  consineeIsCustomer: "0",
  consineeIsCustomerObj: "",
  isEventStatusIgnored: "0",
  response: "",
  errorMsg: "",
  isSuccess: "F",
};

function setEventLogObj(key, value, isJson = false) {
  eventLogObj = {
    ...eventLogObj,
    [key]: isJson ? JSON.stringify(value) : value,
  };
}


module.exports.handler = async (event, context, callback) => {
  console.info("event", JSON.stringify(event));

  eventLogObj = {
    Id: "",
    createdAt: "",
    houseBill: "",
    statusCode: "",
    latitude: "",
    longitude: "",
    eventTime: "",
    signatory: "",
    payload: "",
    sentPayload: "",
    xmlPayload: "",
    xmlResponse: "",
    FK_OrderNo: "",
    FK_ServiceId: "",
    consineeIsCustomer: "0",
    consineeIsCustomerObj: "",
    isEventStatusIgnored: "0",
    response: "",
    errorMsg: "",
    isSuccess: "F",
  };
  
  eventLogObj.Id = uuidv4();
  eventLogObj.createdAt = momentTZ
    .tz("America/Chicago")
    .format("YYYY-MM-DD HH:mm:ss")
    .toString();


  const { body } = event;

  let validationData = "";
  eventLogObj = {
    ...eventLogObj,
    houseBill: body.addMilestoneRequest?.housebill?.toString() ?? "",
    statusCode: body.addMilestoneRequest?.statusCode?.toString() ?? "",
    eventTime: body.addMilestoneRequest?.eventTime?.toString() ?? "",
    latitude: body.addMilestoneRequest?.latitude?.toString() ?? "",
    longitude: body.addMilestoneRequest?.longitude?.toString() ?? "",
    signatory: body.addMilestoneRequest?.signatory?.toString() ?? "",
  };

  if (!body.hasOwnProperty("addMilestoneRequest")) {
    console.log("eventLogObj", eventLogObj);
    return callback(response("[400]", "addMilestoneRequest is required"));
  }

  if (body.addMilestoneRequest.statusCode === "DEL") {
    validationData = eventDeliveredValidation.validate(body);
  } else if(body.addMilestoneRequest.statusCode === "LOC"){
    validationData = eventLocationValidation.validate(body);
  } else {
    validationData = eventValidation.validate(body);
  }

  const { error, value } = validationData;
  console.info("validated data", value);
  if (error) {
    let msg = error.details[0].message
      .split('" ')[1]
      .replace(new RegExp('"', "g"), "");
    let key = error.details[0].context.key;

    setEventLogObj("errorMsg", key + " " + msg);
    console.log("eventLogObj", eventLogObj);
    return callback(response("[400]", key + " " + msg));
  }


  const timestamp = momentTZ().format('YYYYMMDD_HHmmss');
  // Append timestamp to the file name
  const fileNameWithTimestamp = 'add_milestone_' +`${timestamp}.json`;

  const payload = JSON.stringify(event);

  // const params = {
  //   Bucket: 'dw-test-etl-job',
  //   Key: `Test/${fileNameWithTimestamp}`,
  //   Body: payload,
  //   ContentType: 'application/json'
  // }

  // const s3Response = await s3.putObject(params).promise();

  // console.log("S3 Response", s3Response);
  try{
    const apiRespone = await sendPayloadtoApi(payload);
    console.log("Covenant API Response", apiRespone);
    return {
      addMilestoneResponse: {
        message: 'Success',
        id: eventLogObj.Id
      },
    };

  } catch (error){
    return callback(response("[400]", error));
  }

};

/**
 * send postData to the CONVENANT_TRACKING_URL api
 * @param {*} postData
 * @returns
 */
async function sendPayloadtoApi(postData) {
  try {
    const res = await axios.post(process.env.CONVENANT_TRACKING_URL, postData, {
      headers: {
        'x-api-key': process.env.CONVENANT_TRACKING_API_KEY
      },
    });
    return res.data;
    
  } catch (e) {
    console.log("e:addMilestoneApi", e);
    throw "Request Failed";
  }
}

//*******************************************************************//


/**
 * return response
 * @param {*} code
 * @param {*} message
 * @returns
 */
function response(code, message) {
  return JSON.stringify({
    httpStatus: code,
    message,
  });
}


async function queryDynamo(params) {
  try {
    const documentClient = new AWS.DynamoDB.DocumentClient({
      region: process.env.REGION,
    });
    const response = await documentClient.query(params).promise();
    return response;
  } catch (error) {
    console.log("error", error);
    return { Items: [] };
  }
}
