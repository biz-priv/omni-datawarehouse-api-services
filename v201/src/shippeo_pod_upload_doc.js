const {
	SHIPMENT_HEADER_TABLE,
	SHIPMENT_HEADER_TABLE_STREAM_QLQ,
	SNS_TOPIC_ARN,
	SHIPPEO_USERNAME,
	SHIPPEO_PASSWORD,
	SHIPPEO_GET_DOC_URL,
	SHIPPEO_UPLOAD_DOC_URL,
	LOG_TABLE,
	SHIPPEO_GET_TOKEN_URL,
	SHIPPEO_GET_DOC_API_KEY,
	WT_WEBSLI_API_URL,
} = process.env;
const { get } = require("lodash");
const axios = require("axios");
const FormData = require("form-data");
const AWS = require("aws-sdk");
const dynamoDB = new AWS.DynamoDB.DocumentClient();
const sns = new AWS.SNS();
const sqs = new AWS.SQS();
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");
const request = require("request");

module.exports.handler = async (event, context, callback) => {
	let body;
	try {
		console.info("Event: \n", JSON.stringify(event));
		const records = get(event, "Records", []);
		console.log(
			"🚀 ~ file: shippeo_pod_upload_doc.js:27 ~ module.exports.handler= ~ records:",
			records
		);

		// Get Token
		const username = SHIPPEO_USERNAME;
		const password = SHIPPEO_PASSWORD;
		const basicAuth = getBasicAuth({ username, password });
		console.log(basicAuth);
		const url = SHIPPEO_GET_TOKEN_URL;
		const getTokenRes = await getToken({ url, token: basicAuth });
		const token = get(getTokenRes, "data.token");
		await Promise.all(
			records.map(async (record) => {
				console.log(SHIPMENT_HEADER_TABLE);
				body = JSON.parse(get(record, "body", ""));
				const FK_OrderNo = get(body, "Item.PK_OrderNo", "");
				const houseBillNo = get(body, "Item.Housebill", "");
				// const validHouseBillNo = await getIfHouseBillNumberValid({
				// 	FK_OrderNo,
				// });
				// console.log(
				// 	"🚀 ~ file: shippeo_pod_upload_doc.js:30 ~ records.map ~ validHouseBillNop:",
				// 	validHouseBillNo
				// );

				// if (!validHouseBillNo) {
				// 	console.log(`${houseBillNo} is not valid.`);
				// 	return;
				// }

				const getDocUrl = `${SHIPPEO_GET_DOC_URL}?docType=HOUSEBILL&housebill=${houseBillNo}`;
				const xApiKey = SHIPPEO_GET_DOC_API_KEY;
				console.log(
					"🚀 ~ file: shippeo_pod_upload_doc.js:57 ~ records.map ~ getDocUrl:",
					getDocUrl
				);
				console.log(
					"🚀 ~ file: shippeo_pod_upload_doc.js:57 ~ records.map ~ xApiKey:",
					xApiKey
				);
				// const xApiKey = "fIZpXhfGKQ42h6zIs7EUetiJd9yiAui7LlZxbkFh";
				// const getDocumentRes = await getDocument({ url: getDocUrl, xApiKey });
				// const docs = get(getDocumentRes, "getDocumentResponse.documents", []);

				const uploadToUrl = `${SHIPPEO_UPLOAD_DOC_URL}/${6986204}/files`;
				await uploadDocs({ uploadToUrl, token, houseBillNo });
			})
		);
	} catch (error) {
		console.error("Error : \n", error);
		return;
		try {
			const params = {
				Subject: "Error on shippeo-pod-upload-doc lambda",
				Message: `EDI alert reports Error in omni,\n lambda :shippeo-pod-upload-doc \n ERROR: ${error}`, // The message you want to send
				TopicArn: SNS_TOPIC_ARN, // The ARN (Amazon Resource Name) of your SNS topic
			};
			const data = await sns.publish(params).promise();
			console.log("Error notification Message sent:", data.MessageId);

			const queueUrl = SHIPMENT_HEADER_TABLE_STREAM_QLQ;
			const queueMessage = {
				QueueUrl: queueUrl,
				MessageBody: JSON.stringify(body),
			};
			console.log(
				"🚀 ~ file: shipment_header_table_stream_processor.js:31 ~ event.Records.forEach ~ queueMessage:",
				queueMessage
			);
			await sqs.sendMessage(queueMessage).promise();
		} catch (err) {
			console.log("Error while sending error notification message:", err);
		}
		return callback(null, { statusCode: 500 });
		// return callback(null, { statusCode: 500, body: JSON.stringify(error) });
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

const uploadDocs = async ({ uploadToUrl, token, houseBillNo }) => {
	const formData = new FormData();
	// docs.forEach(async (doc) => {
	// 	const { data: fileContent } = await axios.get(get(doc, "url"), {
	// 		responseType: "arraybuffer",
	// 	});
	// 	console.log(
	// 		"🚀 ~ file: shippeo_pod_upload_doc.js:146 ~ docs.forEach ~ fileContent:",
	// 		typeof fileContent
	// 	);
	// 	const fileName = get(doc, "filename");
	// 	console.log(
	// 		"🚀 ~ file: shippeo_pod_upload_doc.js:149 ~ docs.forEach ~ fileName:",
	// 		fileName
	// 	);
	// 	const bufferData = Buffer.from(fileContent);
	// 	const base64String = bufferData.toString("base64");
	// 	fs.writeFileSync(fileName, base64String);
	// 	formData.append("attachments[]", fileContent);
	// 	// formData.append("attachments[]", fs.createReadStream(fileName));
	// });

	const { b64str, api_status_code, Res } = await callWtRestApi(houseBillNo);
	console.log("🚀 ~ file: shippeo_pod_upload_doc.js:165 ~ uploadDocs ~ b64str:", b64str)
	const filePath = `/tmp/${houseBillNo}.pdf`;
	const fileData = Buffer.from(b64str, "base64");
	console.log(
		"🚀 ~ file: shippeo_pod_upload_doc.js:169 ~ uploadDocs ~ filePath:",
		filePath
	);

	fs.writeFileSync(filePath, fileData);

	const fileStat = fs.statSync(filePath);
	const contentLength = String(get(fileStat, "size", 0));

	const resp = await callExternalApiToUploadDoc({
		filePath,
		fileSize: contentLength,
		token,
		url: uploadToUrl,
	});

	// const file = fs.createReadStream(filePath, {
	// 	encoding: "base64",
	// });
	// console.log(
	// 	"🚀 ~ file: shippeo_pod_upload_doc.js:169 ~ uploadDocs ~ file:",
	// 	file
	// );

	// formData.append("attachments[]", file);
	// const fileStat = fs.statSync(filePath);
	// const contentLength = String(get(fileStat, "size", 0));
	// console.log(
	// 	"🚀 ~ file: shippeo_pod_upload_doc.js:173 ~ uploadDocs ~ contentLength:",
	// 	contentLength
	// );

	if (resp.status === 200) {
		await insertLog({housebillNumber: houseBillNo, data: resp.data});
	}
};

const insertLog = async ({ housebillNumber, data }) => {
	const params = {
		TableName: LOG_TABLE,
		Item: {
			pKey: housebillNumber,
			data,
		},
	};

	try {
		await dynamoDB.put(params).promise();
		console.log("Item inserted successfully");
	} catch (err) {
		console.error("Unable to insert item. Error:", err);
	}
};

function createDirectoryIfNotExists(directoryPath) {
	if (!fs.existsSync(directoryPath)) {
		fs.mkdirSync(directoryPath, { recursive: true });
		console.log(`Directory '${directoryPath}' created.`);
	} else {
		console.log(`Directory '${directoryPath}' already exists.`);
	}
}

function convertBase64ToPdf(base64String, filePath) {
	return new Promise((resolve, reject) => {
		const fileData = Buffer.from(base64String, "base64");
		fs.writeFileSync(filePath, fileData, function (err) {
			if (err) {
				console.error("Error converting Base64 to PDF:", err);
				reject(err);
			}
			resolve();
		});
	});
}

async function callWtRestApi(housebill) {
	try {
		const url = `${process.env.WT_WEBSLI_API_URL}/9980f7b9eaffb71ce2f86734dae062/housebill=${housebill}/doctype=HOUSEBILL`;

				const response = await axios.get(url);
		return {
			b64str: response.data.wtDocs.wtDoc[0].b64str,
			api_status_code: response.status,
			Res: response,
		};
	} catch (error) {
		console.error(
			`Error calling WT REST API for housebill ${housebill}:`,
			error
		);
		return "error";
	}
}

const callExternalApiToUploadDoc = async ({
	filePath,
	fileSize,
	token,
	url,
}) => {
	const formData = new FormData();
	formData.append(
		"attachments[]",
		fs.createReadStream(filePath, {
			encoding: "base64",
			autoClose: true,
			start: 0,
			end: Number(fileSize),
		})
	);
	try {
		const config = {
			method: "post",
			maxBodyLength: Infinity,
			url: url,
			headers: {
				...formData.getHeaders(),
				Authorization: `Bearer ${token}`,
				"Content-Type": "multipart/form-data",
				"Content-Length": fileSize,
			},
			data: formData,
		};
		console.log(
			"🚀 ~ file: shippeo_pod_upload_doc.js:188 ~ uploadDocs ~ config:",
			JSON.stringify(config)
		);
		const response = await axios.request(config);
		console.log("Response Data:", response.data);
		console.log("Status Code:", response.status);
		return { data: response.data, status: response.status };
	} catch (error) {
		if (error.response) {
			// The request was made and the server responded with a non-2xx status code
			console.log("Status Code:", error.response.status);
			console.log("Response Data:", JSON.stringify(error.response.data)); // This contains the error response data
			console.log("Response Headers:", error.response.headers);
		} else if (error.request) {
			// The request was made but no response was received
			console.error("No response received:", error.request);
		} else {
			// An error occurred while setting up the request
			console.error("Error:", error.message);
		}
		return false;
	}
};

// const

const getIfHouseBillNumberValid = async ({ FK_OrderNo }) => {
	const getFileDataParams = {
		TableName: process.env.SHIPMENT_FILE_TABLE,
		KeyConditionExpression: "FK_OrderNo  = :FK_OrderNo ",
		FilterExpression:
			"(FK_DocType = :FK_DocType1 OR FK_DocType = :FK_DocType2) AND CustomerAccess = :CustomerAccess",
		ExpressionAttributeValues: {
			":FK_OrderNo ": FK_OrderNo,
			":FK_DocType1": "HCPOD",
			":FK_DocType2": "POD",
			":CustomerAccess": "Y",
		},
	};
	console.log(
		"🚀 ~ file: shippeo_pod_upload_doc.js:109 ~ getHouseBillNumber ~ getFileDataParams:",
		getFileDataParams
	);
	const result = await dynamoDB.query(getFileDataParams).promise();
	console.log(
		"🚀 ~ file: shippeo_pod_upload_doc.js:125 ~ getIfHouseBillNumberValid ~ result:",
		result
	);
	return get(result, "Items", []).length > 0;
};
