const AWS = require("aws-sdk");
const Joi = require("joi");
const axios = require("axios");
const { create, convert } = require("xmlbuilder2");

const CommodityInputValidation = {
  CommodityPieces: Joi.number().integer(),
  CommodityPieceType: Joi.string(),
  CommodityWeight: Joi.number().integer(),
  CommodityLength: Joi.number().integer(),
  CommodityWidth: Joi.number().integer(),
  CommodityHeight: Joi.number().integer(),
  CommodityHazmat: Joi.number().integer(),
};
const eventValidation = Joi.object().keys({
  RatingInput: Joi.object()
    .keys({
      RequestID: Joi.number().integer(),
      OriginCountry: Joi.string(),
      OriginCity: Joi.string(),
      OriginState: Joi.string(),
      OriginZip: Joi.number().integer().required(),
      DestinationCountry: Joi.string(),
      DestinationCity: Joi.string(),
      DestinationState: Joi.string(),
      DestinationZip: Joi.number().integer().required(),
      ShipmentTerms: Joi.string(),
      PickupDate: Joi.date().required(),
      PickupTime: Joi.date().required(),
      PickupLocationCloseTime: Joi.date().required(),
    })
    .required(),
  CommodityInput: Joi.object()
    .keys({
      CommodityInput: Joi.alternatives(
        Joi.string(),
        Joi.object().keys(CommodityInputValidation),
        Joi.array().items(CommodityInputValidation)
      ).required(),
    })
    .required(),
});

module.exports.handler = async (event, context, callback) => {
  const LiabilityType = "LL",
    WebTrakUserID = "biztest";

  const { error, value } = eventValidation.validate(event.body);
  if (error) {
    return errorMsg(400, "Please provide all required fields.", error.details);
  }
  const apiKey = event.headers["x-api-key"];
  const eventBody = event.body;
  eventBody.RatingInput.LiabilityType = LiabilityType;
  eventBody.RatingInput.WebTrakUserID = WebTrakUserID;
  try {
    const customerId = await getCustomerId(apiKey);
    if (customerId == null) {
      return errorMsg(400, "Api key validation error");
    }
    const postData = makeJsonToXml(eventBody);
    const dataResponse = await getRating(postData);
    const dataObj = makeXmlToJson(dataResponse);
    return dataObj;
  } catch (error) {
    return errorMsg(400, "Something went wrong.", error);
  }
};

function errorMsg(code, message, error = null) {
  return {
    httpStatus: code,
    code,
    message,
    error,
  };
}

function makeJsonToXml(data) {
  return convert({
    "soap12:Envelope": {
      "@xmlns:xsi": "http://www.w3.org/2001/XMLSchema-instance",
      "@xmlns:xsd": "http://www.w3.org/2001/XMLSchema",
      "@xmlns:soap12": "http://www.w3.org/2003/05/soap-envelope",
      "soap12:Body": {
        GetRating: {
          "@xmlns": "http://tempuri.org/",
          RatingParam: data,
        },
      },
    },
  });
}

function makeXmlToJson(data) {
  let obj = convert(data, { format: "object" });
  return obj["soap:Envelope"]["soap:Body"].GetRatingResponse.GetRatingResult
    .RatingOutput;
}

function getCustomerId(ApiKey) {
  return new Promise(async (resolve, reject) => {
    const documentClient = new AWS.DynamoDB.DocumentClient({
      region: process.env.REGION,
    });
    const params = {
      TableName: process.env.TOKEN_VALIDATOR,
      FilterExpression: "#ApiKey = :ApiKey",
      ExpressionAttributeNames: { "#ApiKey": "ApiKey" },
      ExpressionAttributeValues: { ":ApiKey": ApiKey },
    };
    try {
      const response = await documentClient.scan(params).promise();
      if (
        response.Items &&
        response.Items.length > 0 &&
        response.Items[0].CustomerID
      ) {
        resolve(response.Items[0].CustomerID);
      } else {
        resolve(null);
      }
    } catch (e) {
      reject("getCustomerId Error: Request failed with status code 500");
    }
  });
}

function getRating(postData) {
  return new Promise(async (resolve, reject) => {
    try {
      const res = await axios.post(
        "https://worldtrak.omnilogistics.com/WTKServices/GetRating.asmx",
        postData,
        {
          headers: {
            Accept: "text/xml",
            "Content-Type": "text/xml; charset=utf-8",
          },
        }
      );
      if (res.status == 200) {
        resolve(res.data);
      } else {
        reject(e.response.statusText);
      }
    } catch (e) {
      reject("getRating Error: " + e.response.statusText);
    }
  });
}
