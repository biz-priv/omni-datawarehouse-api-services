const AWS = require("aws-sdk");
const Joi = require("joi");
const axios = require("axios");
const { convert } = require("xmlbuilder2");

const replaceNull = Joi.allow(null).empty("").default(null);
const CommodityInputValidation = {
  CommodityClass: Joi.number().precision(2).concat(replaceNull),
  CommodityPieces: Joi.number().integer().concat(replaceNull),
  CommodityPieceType: Joi.string().concat(replaceNull),
  CommodityWeightPerPiece: Joi.number().integer().concat(replaceNull),
  CommodityWeight: Joi.number().integer().concat(replaceNull),
  CommodityLength: Joi.number().integer().concat(replaceNull),
  CommodityWidth: Joi.number().integer().concat(replaceNull),
  CommodityHeight: Joi.number().integer().concat(replaceNull),
  CommodityHazmat: Joi.string().concat(replaceNull),
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
      PickupDate: Joi.date().iso().greater("now").required(),
      PickupTime: Joi.date().iso().greater("now").required(),
      PickupLocationCloseTime: Joi.date().iso().greater("now").required(),
    })
    .required(),
  CommodityInput: Joi.object()
    .keys({
      CommodityInput: Joi.alternatives(
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
  const eventBody = value;
  eventBody.RatingInput.LiabilityType = LiabilityType;
  eventBody.RatingInput.WebTrakUserID = WebTrakUserID;
  eventBody.RatingInput.PickupDate =
    event.body.RatingInput.PickupDate.toString();
  eventBody.RatingInput.PickupTime =
    event.body.RatingInput.PickupTime.toString();
  eventBody.RatingInput.PickupLocationCloseTime =
    event.body.RatingInput.PickupLocationCloseTime.toString();
  try {
    const customerData = await getCustomerId(apiKey);
    if (customerData == null) {
      return errorMsg(400, "Api key validation error");
    } else if (
      !customerData.hasOwnProperty("WebTrackId") ||
      customerData.WebTrackId == null
    ) {
      return errorMsg(400, "No valid WebTrackId");
    }
    eventBody.RatingInput.WebTrackId = customerData.WebTrackId;

    const postData = makeJsonToXml(eventBody);
    console.log(postData);
    // return {};
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
      if (response.Items && response.Items.length > 0) {
        resolve(response.Items[0]);
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
