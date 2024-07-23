import {asyncHandler} from "../utils/asyncHandler.js"
import {ApiError} from "../utils/ApiError.js"
import { User } from "../models/user.model.js"
import { uploadOnCloudinary } from "../utils/cloudinary.js"
import { ApiResponse } from "../utils/ApiResponse.js"
import jwt from "jsonwebtoken"
import mongoose from "mongoose"

const generateAccessAndRefreshToken = async (userId) => {
  try {
    const user = await User.findById(userId)
    const accessToken = user.generateAccessToken()
    const refreshToken = user.generateRefreshToken()

    user.refreshToken = refreshToken
    await user.save({validateBeforeSave : false})

    return {accessToken,refreshToken}
  } catch (error){
    throw new ApiError(500,"Something went wrong while generating access and refresh token")
  }
}

const registerUser = asyncHandler( async (req, res) =>{
  //Algorithm to register a user:
  //1. Get user details from frontend - Postman
  //2. Validation on fiels - Not empty
  //3. Check if user already exists with - Username and email
  //4. Check for images, check for avatar(required field)
  //5. Upload these images on cloudinary, check for avatar uploaded or not
  //6. Create a User object and make an entry in DB
  //7. Remove password and refreshtoken fields from response(should not be provided to user)
  //8. Check for user creation
  //9. Return response res


  //1. Get user details from frontend - Postman req.body
  const {email,password, fullName, username} = req.body
  console.log("email: ",email)
 

  //2. Validation on fiels - Not empty
  if (
    [email,password,fullName,username].some((field)=>
      field?.trim() === "")
  ) {
    throw new ApiError(400,"All fields are required")
  }

  //3. Check if user already exists with - Username and email
  const existedUser = await User.findOne({
    $or:[{ username },{ email }]
  })

  if(existedUser){
    throw new ApiError(409,"User already exists")
  }


  //4. Check for images, check for avatar(required field)
  let avatarLocalPath;
  if(req.files && Array.isArray(req.files.avatar) && req.files.avatar.length > 0){
    avatarLocalPath = req.files.avatar[0].path
  }
  
  let coverImageLocalPath;
  if(req.files && Array.isArray(req.files.coverImage) && req.files.coverImage.length > 0){
    coverImageLocalPath = req.files.coverImage[0].path
  }

  if(!avatarLocalPath){throw new ApiError(400,"Avatar is required")}


  //5. Upload these images on cloudinary, check for avatar uploaded or not
  const avatar = await uploadOnCloudinary(avatarLocalPath)
  const coverImage = await uploadOnCloudinary(coverImageLocalPath)

  if(!avatar){throw new ApiError(400,"Avatar is required")}

  //6. Create a User object and make an entry in DB
  const user = await User.create({
    fullName,
    avatar:avatar.url,
    coverImage:coverImage?.url || "",
    username: username.toLowerCase(),
    email,
    password
  })

  //7. Remove password and refreshtoken fields from response(should not be provided to user)
  const createdUser = await User.findById(user._id).select(
    "-password -refreshToken"
  )

  //8. Check for user creation
  if(!createdUser){throw new ApiError(500,"Something went wrong while creating User")}
  console.log(createdUser.coverImage)

  //9. Return response res
  return res.status(201).json(
    new ApiResponse(200,createdUser,"User registered Successfully!")
  )

})

const loginUser = asyncHandler( async(req,res) => {
  //1. Get data from req.body
  //2. Username or email
  //3. Find the user
  //4. Password check
  //5. Generate access and refresh token
  //6. Send cookies
  
  //1. Get data from req.body
  const {email,username,password} = req.body

  //2. Username or email
  if(!username && !email){
    throw new ApiError(400,"Email or username is required")
  }

  //3. Find the user
  const user = await User.findOne({
    $or:[{email},{username}]
  }
  )
  if(!user){
    throw new ApiError(404,"User does not exist")
  }

  //4. Password check
  const isPasswordValid = await user.isPasswordCorrect(password)

  if(!isPasswordValid){
    throw new ApiError(401,"Invalid user credentials")
  }

  //5. Generate access and refresh token
  const {accessToken,refreshToken} = await generateAccessAndRefreshToken(user._id)

  const loggedInUser = await User.findById(user._id).select("-password -refreshToken")

  //6. Send cookies
  const options = {
    httpOnly : true,
    secure : true
  }

  return res
  .status(200)
  .cookie("accessToken",accessToken,options)
  .cookie("refreshToken",refreshToken,options)
  .json(
    new ApiResponse(
      200,
      {
        user:loggedInUser,accessToken,refreshToken
      },
      "User Logged In Successfully!"
    )
  )
})
 
const logoutUser = asyncHandler(async (req,res) => {

  //1. Remove the old refreshToken
  await User.findByIdAndUpdate(
    req.user._id,
    {
      $set : {
        refreshToken : undefined
      }
    },
    {
      new : true
    }
  )


  //2. Clear all the cookies for respective session and send response
  const options = {
    httpOnly :true,
    secure: true
  }

  return res
  .status(200)
  .clearCookie("accessToken",options)
  .clearCookie("refreshToken",options)
  .json(new ApiResponse(200, {},"User Logged Out!"))


})

const refreshAccessToken = asyncHandler(async (req,res) =>{
  const incomingRefreshToken = req.cookies.refreshToken || req.body.refreshToken 

  if(!incomingRefreshToken) {
    throw new ApiError(401,"Unauthorized Request")
  }

  try {
    const decodedToken = jwt.verify(incomingRefreshToken,process.env.REFRESH_TOKEN_SECRET)
  
    const user = await User.findById(decodedToken._id)
  
    if(!user){
      throw new ApiError(401,"Invalid refresh token")
    }
  
    if(incomingRefreshToken !== user?.refreshToken){
      throw new ApiError(401,"Refresh token expired or Already used")
    }
  
    const options = {
      httpOnly:true,
      secure: true
    }
  
    const {accessToken,newRefreshToken} =await generateAccessAndRefreshToken(user._id)
    
    return res
    .status(200)
    .cookie("accessToken", accessToken,options)
    .cookie("refreshToken",newRefreshToken,options)
    .json(
      new ApiResponse(200,
        {accessToken,refreshToken:newRefreshToken},
        "Access token refreshed Successfully ")
    )
  } catch (error) {
    throw new ApiError(401,error?.message || "Invalid Refresh Token")
  }
  
})

const changeCurrentPassword = asyncHandler(async (req,res) => {
  const {oldPassword,newPassword} = req.body

  //Extracted User
  const user = await User.findById(req.user._id)

  if(!user){
    throw new ApiError(401,"Unauthorized Request")
  }

  //Verified old Password
  const isPasswordCorrect = await user.isPasswordCorrect(oldPassword)

  if(!isPasswordCorrect){
    throw new ApiError(400,"Invalid Old Password")
  }

  //Set new password
  user.password = 
  
  //Saved in the database
  await user.save({validateBeforeSave:false})

  return res
  .status(200)
  .json(new ApiResponse(
    201,{},"Password Updated Successfully"
  ))
})

const getCurrentUser = asyncHandler(async (req,res) => {
  return res
  .status(200)
  .json(new ApiResponse(
    201,req.user,"Current User Details fetched Successfully"
  ))
})


const updateAccountDetails = asyncHandler(async(req,res) => {
  const {fullName,email} = req.body

  if(!fullName || !email){
    throw new ApiError(401,"Full Name and email is required")
  }
  
  const user = await User.findByIdAndUpdate(
    req.user?._id,
    {
     $set:{
      fullName,
      email
     }
    },
    {new:true}
  ).select("-password")

  return res
  .status(200)
  .json(new ApiResponse(200,user,"User details updated Successfully"))
})

const updateUserAvatar = asyncHandler(async(req,res)=>{
  const avatarLocalPath = req.file?.path

  if(!avatarLocalPath){
    throw new ApiError(400,"Avatar file is missing")
  }

  const avatar = await uploadOnCloudinary(avatarLocalPath)

  if(!avatar.url){
    throw new ApiError(400,"Error while uploading avatar")
  }

  const user = await User.findByIdAndUpdate(req.user._id,{
    $set:{
      avatar:avatar.url
    },
  },
  {new:true}).select("-password")

  return res
  .status(200)
  .json(new ApiResponse(200,user,"Avatar updated Successfully"))
})

const updateUserCoverImage = asyncHandler(async(req,res)=>{
  const coverImageLocalPath = req.file?.path

  if(!coverImageLocalPath){
    throw new ApiError(400,"Cover Image file is missing")
  }
 
  const coverImage = await uploadOnCloudinary(coverImageLocalPath)

  if(!coverImage.url){
    throw new ApiError(400,"Error while uploading cover image")
  }

  const user = await User.findByIdAndUpdate(req.user._id,{
    $set:{
      coverImage:coverImage.url
    },
  },
  {new:true}).select("-password")

  return res
  .status(200)
  .json(new ApiResponse(200,user,"Cover Image updated Successfully"))
})

const getUserChannelProfile = asyncHandler(async(req,res)=>{
  const {username} = req.params

  if(!username?.trim()){
    throw new ApiError(400,"Username is missing")
  }

  //Aggregation Pipelines
  const channel = await User.aggregate([
    {
      $match:{
        username : username?.toLowerCase()
      }
    },
    {
      $lookup:{
        from:"subscriptions",
        localField:"_id",
        foreignField:"channel",
        as:"subscribers"
      }
    },
    {
      $lookup:{
        fromrom:"subscriptions",
        localField:"_id",
        foreignField:"subscriber",
        as:"subscribedTo"
      }
    },
    {
      $addFields:{
        subscribersCount:{
          $size:"$subscribers"
        },
        channelsSubscibedTo:{
          $size:"$subscribedTo"
        },
        isSubscribed:{
          $cond:{
            if:{$in:[req.user?._id,"$subscribers.subscriber"]},
            then:true,
            else:false
          }
        }
      }
    },
    {
      $project:{
        fullName:1,
        email:1,
        username:1,
        subscribersCount:1,
        channelsSubscibedTo:1,
        isSubscribed:1,
        avatar:1,
        coverImage:1
      }
    }
  ])

  if(!channel?.length){
    throw new ApiError(404,"Channel Does not exist")
  }

  return res
  .status(200)
  .json(
    new ApiResponse(200, channel[0],"User Channel fetched Successfully")
  )
})


const getWatchHistory = asyncHandler(async(req,res)=>{
  const user = await User.aggregate([
    {
        $match: {
            _id: new mongoose.Types.ObjectId(req.user._id)
        }
    },
    {
        $lookup: {
            from: "videos",
            localField: "watchHistory",
            foreignField: "_id",
            as: "watchHistory",
            pipeline: [
                {
                    $lookup: {
                        from: "users",
                        localField: "owner",
                        foreignField: "_id",
                        as: "owner",
                        pipeline: [
                            {
                                $project: {
                                    fullName: 1,
                                    username: 1,
                                    avatar: 1
                                }
                            }
                        ]
                    }
                },
                {
                    $addFields:{
                        owner:{
                            $first: "$owner"
                        }
                    }
                }
            ]
        }
    }
])

return res
.status(200)
.json(new ApiResponse(200,user[0].watchHistory,"User watch history fetched Successfully!"))
})


export {
  registerUser,
  loginUser,
  logoutUser,
  refreshAccessToken,
  changeCurrentPassword,
  getCurrentUser,
  updateAccountDetails,
  updateUserAvatar,
  updateUserCoverImage,
  getUserChannelProfile,
  getWatchHistory
}