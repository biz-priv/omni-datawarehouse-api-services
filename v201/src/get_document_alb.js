const AWS = require("aws-sdk");
const Joi = require("joi");
const axios = require("axios");
const { v4: uuidv4 } = require("uuid");
const dynamo = new AWS.DynamoDB.DocumentClient();
const { get } = require("lodash");

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
                "WAYBILL",
                "LABELZPL"
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
                    "WAYBILL",
                    "LABELZPL"
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
	console.info("Event", event);
	try {
		const authorizeRes = await authorize(event);
		if (!authorizeRes) {
			return {
				code: 401,
				statusCode: 401,
				statusDescription: "401 Unauthorized",
				isBase64Encoded: false,
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ message: "Invalid api key." }),
			};
		}
		let eventParams = event.queryStringParameters;
		console.info("eventParams", eventParams);
		let doctypeValue = eventParams.docType;
		doctypeValue = doctypeValue.split(",");
		let parameterString = doctypeValue
			.map((value) => `doctype=${value}`)
			.join("|");

        console.info(parameterString);
        console.info("eventParams", doctypeValue);
        console.info("websli-api-url", process.env.GET_DOCUMENT_API);

        const searchType = eventParams.hasOwnProperty("housebill")
            ? "housebill"
            : "fileNumber";
        eventParams.docType = doctypeValue;
        try {
            searchType === "housebill"
                ? await housebillSchema.validateAsync(eventParams)
                : await fileNumberSchema.validateAsync(eventParams);
        } catch (error) {
            console.error("searchType:error", error);

            return response(error?.message ?? "")
        }

        // await getDataWithoutGateway(eventParams, parameterString, searchType);
        const resp = await getData(eventParams, parameterString, searchType);

        const newResponse = await newResponseStructureForV2(resp);
        console.info("newResponse", newResponse);

        for (let index = 0; index < newResponse.getDocumentResponse.documents.length; index++) {
            const item = newResponse.getDocumentResponse.documents[index];
            let s3Result = await createS3File(item.filename, new Buffer(item.b64str, 'base64'));
            let url = await generatePreSignedURL(item.filename);
            item.url = url;
            delete item.b64str;
            console.info("document url", url);
        }
        console.info("updatedResponse", JSON.stringify(newResponse));

        return {
            "code": 200,
            "statusCode": 200,
            "statusDescription": "200 OK",
            "isBase64Encoded": false,
            "headers": {
                "Content-Type": "application/json"
            },

			body: JSON.stringify({
				newResponse: newResponse,
			}),
		};
	} catch (error) {
		console.error("handler:error", error);
		return response(get(error, "message", ""));
	}
};

async function authorize(event) {
	const apiKey = get(event, "headers.x-api-key", null);
	if (!apiKey) return false;

	const response = await dynamoQuery(
		process.env.TOKEN_VALIDATION_TABLE,
		process.env.TOKEN_VALIDATION_TABLE_INDEX,
		"ApiKey = :apiKey",
		{ ":apiKey": apiKey }
	);
	const customerId = validate_dynamo_query_response(response);
	return typeof customerId === "string";
}

const dynamoQuery = (tableName, indexName, expression, attributes) => {
	try {
		const params = {
			TableName: tableName,
			IndexName: indexName,
			KeyConditionExpression: expression,
			ExpressionAttributeValues: attributes,
		};
		console.log("🚀 ~ file: get_document_alb.js:245 ~ params:", params);

		return dynamo.query(params).promise();
	} catch (error) {
		console.log("error:getDynamoData", error);
		throw error;
	}
};

const validate_dynamo_query_response = (response) => {
	console.info("validate_dynamo_query_response", response);
	try {
		if (get(response, "Items", []).length === 0) {
			return null;
		} else if (get(response, "Items.[0].CustomerID", null)) {
			return get(response, "Items.[0].CustomerID", null);
		}
		return null;
	} catch (cust_id_notfound_error) {
		console.log("CustomerIdNotFound:", cust_id_notfound_error);
		throw new Error("Customer Id not found.");
	}
};

/**
*
* @param response
* @returns
*/
async function newResponseStructureForV2(response) {
    console.info("response====>", response);
    return new Promise((resolve, reject) => {
        const newResponse = {
            id: uuidv4(),
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
        console.info("websli url :", url);

        let getDocumentData = {
            wtDocs: {
                housebill: "",
                fileNumber: "",
                wtDoc: [],
            },
        }

        const queryType = await axios.get(url);
        getDocumentData = queryType.data;
        console.info("data", getDocumentData);
        return getDocumentData;
    } catch (error) {
        console.error("error", error);
        throw error;
    }
}

/**
*
* @param eventParams
* @param searchType
* @returns
*/
async function getDataWithoutGateway(eventParams, parameterString, searchType) {
    try {

        let url = `https://jsi-websli.omni.local/wtProd/getwtdoc/v1/json/fa75bbb8-9a10-4c64-80e8-e48d48f34088/${searchType}=${eventParams[searchType]}/${parameterString}`;
        console.info("websli url :", url);

        let getDocumentData = {
            wtDocs: {
                housebill: "",
                fileNumber: "",
                wtDoc: [],
            },
        }

        const queryType = await axios.get(url);
        getDocumentData = queryType.data;
        console.info("data", getDocumentData);
        //   return getDocumentData;
    } catch (error) {
        console.error("error", error);
        //   throw error;
    }
}

function response(message) {
    return {
        "code": 400,
        "statusCode": 400,
        "statusDescription": "400 Bad Request",
        "isBase64Encoded": false,
        "headers": {
            "Content-Type": "application/json"
        },
        "body": JSON.stringify({
            message: message
        })
    }
}

async function createS3File(filename, body) {
    const S3 = new AWS.S3();
    const params = {
        Key: filename,
        Body: body,
        Bucket: process.env.DOCUMENTS_BUCKET,
        ContentType: 'application/json'
    };
    return await S3.upload(params).promise();
}

async function generatePreSignedURL(filename) {
    const S3 = new AWS.S3();
    const params = {
        Key: filename,
        Bucket: process.env.DOCUMENTS_BUCKET,
        Expires: 15 * 60
    };
    let url = await S3.getSignedUrlPromise('getObject', params)
    return url;
}