import { User } from "../models/user.model";
import { ApiError } from "../utils/ApiError";
import { asyncHandler } from "../utils/asyncHandler";
import jwt from "jsonwebtoken"

export const verifyJWT = asyncHandler(async (req,_,next) => {
  try {
    //Extract the token from cookies (After || section is applied for Mobile application where token is accessed through header)
    const token = req.cookies?.acceesToken || req.header("Authorization")?.replace("Bearer ","")

    if(!token){throw new ApiError(401,"Unauthorized Request")}

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
    throw new ApiError(401,"Invliad Access Token or Request")
  }
})