const AWS = require("aws-sdk");
const Joi = require("joi");
const axios = require("axios");

//1. do a joi valiation
const housebillSchema = Joi.object({
  housebill: Joi.string().required().max(13),
  docType: Joi.alternatives().try(
    Joi.string()
      .required()
      .valid(
        "BI",
        "CONSULAR",
        "CUST RATE",
        "CUSTOMS",
        "DCCL",
        "DECON",
        "HCPOD",
        "HOUSEBILL",
        "IBU",
        "INSURANCE",
        "INVOICE",
        "LABEL",
        "MSDS",
        "OCCL",
        "OMNI RA",
        "ORIG BOL",
        "PACKING",
        "PO",
        "POD",
        "PRO FORMA",
        "RA",
        "WAYBILL"
      ),

    Joi.array().items(
      Joi.string()
        .required()
        .valid(
          "BI",
          "CONSULAR",
          "CUST RATE",
          "CUSTOMS",
          "DCCL",
          "DECON",
          "HCPOD",
          "HOUSEBILL",
          "IBU",
          "INSURANCE",
          "INVOICE",
          "LABEL",
          "MSDS",
          "OCCL",
          "OMNI RA",
          "ORIG BOL",
          "PACKING",
          "PO",
          "POD",
          "PRO FORMA",
          "RA",
          "WAYBILL"
        )
    )
  ),
});
const fileNumberSchema = Joi.object({
  fileNumber: Joi.string().required().max(13),
  docType: Joi.alternatives().try(
    Joi.string()
      .required()
      .valid(
        "BI",
        "CONSULAR",
        "CUST RATE",
        "CUSTOMS",
        "DCCL",
        "DECON",
        "HCPOD",
        "HOUSEBILL",
        "IBU",
        "INSURANCE",
        "INVOICE",
        "LABEL",
        "MSDS",
        "OCCL",
        "OMNI RA",
        "ORIG BOL",
        "PACKING",
        "PO",
        "POD",
        "PRO FORMA",
        "RA",
        "WAYBILL"
      ),

    Joi.array().items(
      Joi.string()
        .required()
        .valid(
          "BI",
          "CONSULAR",
          "CUST RATE",
          "CUSTOMS",
          "DCCL",
          "DECON",
          "HCPOD",
          "HOUSEBILL",
          "IBU",
          "INSURANCE",
          "INVOICE",
          "LABEL",
          "MSDS",
          "OCCL",
          "OMNI RA",
          "ORIG BOL",
          "PACKING",
          "PO",
          "POD",
          "PRO FORMA",
          "RA",
          "WAYBILL"
        )
    )
  ),
});

module.exports.handler = async (event, context, callback) => {
  console.log("Event", event);
  try {
    const eventParams = event.query;
    let doctypeValue = eventParams.docType;
    doctypeValue = doctypeValue.split(",");

    //for local test
    // let eventParams = event;
    // let doctypeValue = eventParams.docType;

    console.log("eventParams", doctypeValue);
    // const xApiKey = event.headers;
    // return {};

    console.log("websli-api-url", process.env.GET_DOCUMENT_API);

    const searchType = eventParams.hasOwnProperty("housebill")
      ? "housebill"
      : "fileNumber";
    try {
      searchType === "housebill"
        ? await housebillSchema.validateAsync(eventParams)
        : await fileNumberSchema.validateAsync(eventParams);
    } catch (error) {
      console.log("error", error);
      return callback(response("[400]", error?.message ?? ""));
    }

    const resp = await getData(eventParams, doctypeValue, searchType);

    //5. change the response structre
    const newResponse = await newResponseStructureForV2(resp);
    console.log("newResponse", newResponse);

    //6. send the response
    return newResponse;
  } catch (error) {
    console.log("error", error);
    return callback(response("[400]", error?.message ?? ""));
  }
};

/**
 *
 * @param response
 * @returns
 */
async function newResponseStructureForV2(response) {
  return new Promise((resolve, reject) => {
    const newResponse = {
      housebill: response?.wtDocs?.housebill ? response.wtDocs.housebill : "",
      fileNumber: response?.wtDocs?.fileNumber
        ? response.wtDocs.fileNumber
        : "",
      documents: response?.wtDocs?.wtDoc ? response.wtDocs.wtDoc : [],
    };

    resolve({ getDocumentResponse: newResponse });
  });
}

/**
 *
 * @param eventParams
 * @param searchType
 * @returns
 */
async function getData(eventParams, doctypeValue, searchType) {
  try {
    const getDocumentData = await Promise.all(
      doctypeValue.map(async (e) => {
        const queryType = await axios.get(
          `${process.env.GET_DOCUMENT_API}/${searchType}=${eventParams[searchType]}/doctype=${e}`
        );
        console.log("queryType==>>>>>>", queryType);
        console.log(
          "websli url :",
          `${process.env.GET_DOCUMENT_API}/${searchType}=${eventParams[searchType]}/doctype=${eventParams.docType}`
        );
        return queryType.data;
      })
    );
    console.log("getDocumentData", getDocumentData);

    let wtArr = [];
    getDocumentData.map((e) => {
      wtArr = [...wtArr, ...e.wtDocs.wtDoc];
    });
    const data = {
      wtDocs: {
        housebill: getDocumentData[0].wtDocs.housebill,
        fileNumber: getDocumentData[0].wtDocs.fileNumber,
        wtDoc: wtArr,
      },
    };
    console.log("data", data);
    return data;
  } catch (error) {
    console.log(
      "websli error url:",
      `${process.env.GET_DOCUMENT_API}/${searchType}=${eventParams[searchType]}/doctype=${eventParams.docType}/`
    );
    console.log("error", error);
    throw error;
  }
}

function response(code, message) {
  return JSON.stringify({
    httpStatus: code,
    message,
  });
}
