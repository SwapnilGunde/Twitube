import {asyncHandler} from "../utils/asyncHandler.js"
import {ApiError} from "../utils/ApiError.js"
import { User } from "../models/user.model.js"
import { uploadOnCloudinary } from "../utils/cloudinary.js"
import { ApiResponse } from "../utils/ApiResponse.js"
import { trusted } from "mongoose"

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
  if(!username || !email){
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

export {
  registerUser,
  loginUser,
  logoutUser
}