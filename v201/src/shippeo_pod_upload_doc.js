const { schema } = require("../../src/shared/validation/index");
const { SHIPMENT_HEADER_TABLE, SHIPMENT_HEADER_TABLE_BILL_NO_INDEX } =
	process.env;
const { queryMethod } = require("../../src/shared/dynamoDB/index");
const { get } = require("lodash");
const axios = require("axios");
const FormData = require("form-data");
const AWS = require("aws-sdk");
const dynamoDB = new AWS.DynamoDB.DocumentClient();

module.exports.handler = async (event, context, callback) => {
	console.info("Event: \n", JSON.stringify(event));
	try {
		console.log(SHIPMENT_HEADER_TABLE);
		const username = "omnitrans-test.carrier-api";
		const password = "MqrIjrtmboB5";
		const basicAuth = getBasicAuth({ username, password });
		console.log(basicAuth);

		const url = "http://api-edi.shippeo.com/api/tokens";
		const getTokenRes = await getToken({ url, token: basicAuth });
		const token = get(getTokenRes, "data.token");

		const getDocUrl = `https://dev-api.omnilogistics.com/v2.1/shipment/getdocument?docType=HOUSEBILL,LABEL&housebill=${6978713}`;
		const xApiKey = "fIZpXhfGKQ42h6zIs7EUetiJd9yiAui7LlZxbkFh";
		const getDocumentRes = await getDocument({ url: getDocUrl, xApiKey });
		const docs = get(getDocumentRes, "getDocumentResponse.documents", []);

		// const

		const uploadToUrl = `http://api-edi.shippeo.com/api/orders/EDIReference/${6978713}/files`;
		await uploadDocs({ docs, uploadToUrl, token });
		console.log(
			"🚀 ~ file: shippeo_pod_upload_doc.js:24 ~ module.exports.handler= ~ docs:",
			docs
		);
	} catch (error) {
		console.error("Error : \n", error);
		return callback(null, { statusCode: 500, body: JSON.stringify(error) });
	}
};

const getBasicAuth = ({ username, password }) => {
	const credentials = `${username}:${password}`;
	// Encode the credentials using base64
	const base64Credentials = Buffer.from(credentials).toString("base64");
	return `Basic ${base64Credentials}`;
};

const getToken = async ({ url, token }) => {
	const { data } = await axios.post(
		url,
		{},
		{
			headers: {
				"Content-Type": "application/json",
				Authorization: token,
			},
		}
	);
	return data;
};

const getDocument = async ({ url, xApiKey }) => {
	const { data } = await axios.get(url, {
		headers: {
			"Content-Type": "application/json",
			"x-api-key": xApiKey,
		},
	});
	return data;
};

const uploadDocs = async ({ docs, uploadToUrl, token }) => {
	const formData = new FormData();
	docs.forEach(async (doc) => {
		const { data: fileContent } = await axios.get(get(doc, "url"), {
			responseType: "arraybuffer",
		});
		formData.append("attachments", fileContent, {
			filename: get(doc, "filename"),
		});
	});

	const { data } = await axios.post(uploadToUrl, formData, {
		headers: {
			...formData.getHeaders(),
			maxBodyLength: Infinity,
			Authorization: `Bearer ${token}`,
		},
	});
	console.log(
		"🚀 ~ file: shippeo_pod_upload_doc.js:89 ~ uploadDocs ~ data:",
		data
	);
};

const getHouseBillNumber = async ({ BillNo }) => {
	const getHouseBillNumber = {
		TableName: process.env.SHIPMENT_HEADER_TABLE,
		IndexName: process.env.SHIPMENT_HEADER_TABLE_BILL_NO_INDEX,
		KeyConditionExpression: "BillNo  = :BillNo ",
		ExpressionAttributeValues: {
			":BillNo ": BillNo,
		},
	};
};
