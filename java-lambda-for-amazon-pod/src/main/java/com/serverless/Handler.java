package com.serverless;

import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;

import com.amazonaws.services.lambda.runtime.Context;
import com.amazonaws.services.lambda.runtime.RequestHandler;
import com.fasterxml.jackson.databind.JsonNode;
// import com.fasterxml.jackson.databind.JsonNode;
// import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.Base64;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
// import org.json.simple.parser.ParseException;

// public class Handler implements RequestHandler<Map<String, Object>, ApiGatewayResponse> {

// 	private static final Logger LOG = LogManager.getLogger(Handler.class);

// 	@Override
// 	public ApiGatewayResponse handleRequest(Map<String, Object> input, Context context) {
// 		LOG.info("received: {}", input);
// 		Response responseBody = new Response("Go Serverless v1.x! Your function executed successfully!", input);
// 		return ApiGatewayResponse.builder()
// 				.setStatusCode(200)
// 				.setObjectBody(responseBody)
// 				.setHeaders(Collections.singletonMap("X-Powered-By", "AWS Lambda & serverless"))
// 				.build();
// 	}
// }

public class Handler
		implements RequestHandler<String, String> {
	private static final Logger LOG = LogManager.getLogger(Handler.class);

	public String handleRequest(String input, Context context) {
		try {
			LOG.info("received: {}", input);
			// String command = "java -jar /opt/java/lib/CallHdssViaCognito.jar";

			ObjectMapper objectMapper = new ObjectMapper();

			JsonNode jsonNode = objectMapper.readTree(input);

			// Access values by field name
			String filename = jsonNode.get("filename").asText();
			String base64 = jsonNode.get("base64").asText();

			// Use the values
			System.out.println("filename: " + filename);
			System.out.println("base64: " + base64);

			String filePath = "/tmp/" + filename;

			String command = "ls -a /tmp";

			byte[] decodedBytes = Base64.getDecoder().decode(base64);
			File file = new File(filePath);

			try (FileOutputStream fos = new FileOutputStream(file)) {
				fos.write(decodedBytes);
			}

			// return "";
			// Create a ProcessBuilder
			ProcessBuilder processBuilder = new ProcessBuilder(command.split(" "));
			processBuilder.redirectErrorStream(true);

			// Start the process
			Process process = processBuilder.start();

			// Read the output of the external JAR
			BufferedReader reader = new BufferedReader(new InputStreamReader(process.getInputStream()));
			StringBuilder output = new StringBuilder();
			String line;
			while ((line = reader.readLine()) != null) {
				output.append(line).append("\n");
			}

			// Wait for the process to complete
			int exitCode = process.waitFor();
			LOG.info(output.toString());
			
			if (exitCode == 0) {
				return "External JAR executed successfully. Output:\n" + output.toString();
			} else {
				return "External JAR execution failed. Output:\n" + output.toString();
			}

		} catch (Exception e) {
			LOG.error("Error parsing JSON: {}", e.getMessage());
			return "Error";
		}
	}
}