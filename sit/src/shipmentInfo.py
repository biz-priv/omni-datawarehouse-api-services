import logging

logger = logging.getLogger()
logger.setLevel(logging.INFO)

def handler(event, context):
    logger.info("Event: {}".format(json.dumps(event)))
    return {"message": "success"}
    