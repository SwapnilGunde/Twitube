import {v2 as cloudinary} from "cloudinary"
import fs from "fs"

cloudinary.config({ 
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME, 
  api_key: process.env.CLOUDINARY_API_KEY, 
  api_secret: process.env.CLOUDINARY_API_SECRET 
});

const uploadOnCloudinary =  async (localfile) => {
  try {
    if (!localfile) return null

    const response = await cloudinary.uploader.upload(localfile,{
      resource_type:"auto"
    })
    console.log("File is uploaded successfully on Cloudinary",response.url)
    fs.unlinkSync(localfile)
    return response

  } catch (error) {
    fs.unlinkSync(localfile)
    return null;
  }
}

export {uploadOnCloudinary}