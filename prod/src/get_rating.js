module.exports.handler = async (event, context, callback) => {
  console.log("event:::", event);
  return {
    message: "Successfully executed",
  };
};
