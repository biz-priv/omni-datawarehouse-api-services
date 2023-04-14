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
    let eventParams = event.query;
    let doctypeValue = eventParams.docType;
    doctypeValue = doctypeValue.split(",");
    let parameterString = doctypeValue
      .map((value) => `doctype=${value}`)
      .join("|");
    // parameterString = parameterString.split(",");
    console.log(parameterString);
    // return {};

    //for local test
    // let eventParams = event;
    // let doctypeValue = eventParams.docType;
    // doctypeValue = doctypeValue.split(",");

    console.log("eventParams", doctypeValue);
    // const xApiKey = event.headers;
    // return {};

    console.log("websli-api-url", process.env.GET_DOCUMENT_API);

    const searchType = eventParams.hasOwnProperty("housebill")
      ? "housebill"
      : "fileNumber";
    eventParams.docType = doctypeValue;
    try {
      searchType === "housebill"
        ? await housebillSchema.validateAsync(eventParams)
        : await fileNumberSchema.validateAsync(eventParams);
    } catch (error) {
      console.log("error", error);
      return callback(response("[400]", error?.message ?? ""));
    }

    const resp = await getData(eventParams, parameterString, searchType);
    // return {};
    //5. change the response structre
    const newResponse = await newResponseStructureForV2(resp);
    console.log("newResponse", newResponse);
    // return {};
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
  console.log("response====>", response);
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
async function getData(eventParams, parameterString, searchType) {
  try {
    
    let url = `${process.env.GET_DOCUMENT_API}/${searchType}=${eventParams[searchType]}/${parameterString}`;
    console.log("websli url :", url);
    
    let getDocumentData = {
      wtDocs: {
        housebill: "",
        fileNumber: "",
        wtDoc: [],
      },
    }

    const queryType = await axios.get(`${process.env.GET_DOCUMENT_API}/${searchType}=${eventParams[searchType]}/${e}`);
    getDocumentData =  queryType.data;

    // const getDocumentData = await Promise.all(
    //   parameterString.map(async (e) => {
    //     try {
    //       const queryType = await axios.get(
    //         `${process.env.GET_DOCUMENT_API}/${searchType}=${eventParams[searchType]}/${e}`
    //       );
    //       console.log("queryType==>>>>>>", queryType);
    //       console.log(
    //         "websli url :",
    //         `${process.env.GET_DOCUMENT_API}/${searchType}=${eventParams[searchType]}/${e}`
    //       );
    //       return queryType.data;
    //     } catch (error) {
    //       console.log("error", error);
    //       return {
    //         wtDocs: {
    //           housebill: "",
    //           fileNumber: "",
    //           wtDoc: [],
    //         },
    //       };
    //     }
    //   })
    // );
    // console.log("getDocumentData", getDocumentData);

    // let wtArr = [];
    // let housebill = "";
    // let fileNumber = "";
    // getDocumentData.map((e) => {
    //   if (e.wtDocs.housebill != "") {
    //     housebill = e.wtDocs.housebill;
    //     fileNumber = e.wtDocs.fileNumber;
    //     wtArr = [...wtArr, ...e.wtDocs.wtDoc];
    //   }
    // });
    // const data = {
    //   wtDocs: {
    //     housebill,
    //     fileNumber,
    //     wtDoc: wtArr,
    //   },
    // };
    console.log("data", getDocumentData);
    return data;
  } catch (error) {
    console.log(
      "websli error url:",
      // `${process.env.GET_DOCUMENT_API}/${searchType}=${eventParams[searchType]}/doctype=${eventParams.docType}/`
      `${process.env.GET_DOCUMENT_API}/${searchType}=${eventParams[searchType]}`
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
