import { User } from "../models/user.model.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import jwt from "jsonwebtoken"

export const verifyJWT = asyncHandler(async (req,res,next) => {
  try {
    //Extract the token from cookies (After || section is applied for Mobile application where token is accessed through header)
    const token = req.cookies?.accessToken || req.header("Authorization")?.replace("Bearer ","")

    if(!token){throw new ApiError(401,"Unauthorized Request : Token not found")}

    
    //Verify obtained token
    const decodedToken = jwt.verify(token,process.env.ACCESS_TOKEN_SECRET)

    //Extract user based on obtained _id from decoded token
    const user = await User.findById(decodedToken._id).select("-password -refreshToken")

    if(!user){
      throw new ApiError(401,"Invalid Access Token")
    }

    //Add user property to req so that we can have the access to this property wherever this middleware is injected
    req.user = user;

    //Forward to next middleware or function
    next()
  } catch (error) {
    throw new ApiError(401,"Unauthorized Request")
  }
})