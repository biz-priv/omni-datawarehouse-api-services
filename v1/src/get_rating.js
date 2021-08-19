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
  const LiabilityType = "LL";

  const { error, value } = eventValidation.validate(event.body);
  if (error) {
    return errorMsg(400, "Please provide all required fields.", error.details);
  }
  const apiKey = event.headers["x-api-key"];
  const eventBody = value;
  eventBody.RatingInput.LiabilityType = LiabilityType;
  eventBody.RatingInput.PickupDate =
    event.body.RatingInput.PickupDate.toString();
  eventBody.RatingInput.PickupTime =
    event.body.RatingInput.PickupTime.toString();
  eventBody.RatingInput.PickupLocationCloseTime =
    event.body.RatingInput.PickupLocationCloseTime.toString();
  try {
    const customerData = await getCustomerId(apiKey);
    eventBody.RatingInput.WebTrakUserID = customerData.WebTrackId;

    const postData = makeJsonToXml(eventBody);
    const dataResponse = await getRating(postData);
    const dataObj = makeXmlToJson(dataResponse);
    return dataObj;
  } catch (error) {
    return errorMsg(400, error != null ? error : "Something went wrong.");
  }
};

function errorMsg(code, message, error = null) {
  return {
    httpStatus: code,
    code,
    message,
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

async function getCustomerId(ApiKey) {
  try {
    const documentClient = new AWS.DynamoDB.DocumentClient({
      region: process.env.REGION,
    });
    const params = {
      TableName: process.env.TOKEN_VALIDATOR,
      FilterExpression: "#ApiKey = :ApiKey",
      ExpressionAttributeNames: { "#ApiKey": "ApiKey" },
      ExpressionAttributeValues: { ":ApiKey": ApiKey },
    };
    const response = await documentClient.scan(params).promise();
    if (response.Items && response.Items.length > 0) {
      if (
        !response.Items[0].hasOwnProperty("WebTrackId") ||
        response.Items[0].WebTrackId == null
      ) {
        throw "getCustomerId Error: No valid WebTrackId";
      }
      return response.Items[0];
    } else {
      throw "getCustomerId Error: Api key validation error";
    }
  } catch (e) {
    throw (
      "getCustomerId Error: " + (e.hasOwnProperty("message") ? e.message : e)
    );
  }
}

async function getRating(postData) {
  try {
    const res = await axios.post(process.env.RATING_API, postData, {
      headers: {
        Accept: "text/xml",
        "Content-Type": "text/xml; charset=utf-8",
      },
    });
    if (res.status == 200) {
      return res.data;
    } else {
      throw "getRating Error: " + e.response.statusText;
    }
  } catch (e) {
    throw (
      "getRating Error: " +
      (e.hasOwnProperty("response") ? "Request failed with status code 500" : e)
    );
  }
}
