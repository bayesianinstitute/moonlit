import { PendingUser, User } from "../models/user.js";

import { TryCatch } from "../middleware/error.js";
import ErrorHandler from "../utils/utitlity.js";
import { generateToken } from "../middleware/auth.js";
import bcrypt from "bcrypt";
import { sendVerificationEmail,sendVerificationEmailSignup } from "../mail/send.js";


export const Login = async (req, res, next) => {
  const { email, password } = req.body;

  // Check if email and password are provided
  if (!email || !password) {
    return next(new ErrorHandler("Please provide email and password", 400));
  }

  // Find user by email
  const user = await User.findOne({ email });

  // If user not found, throw error
  if (!user) {
    return next(new ErrorHandler("User not found, please sign up", 401));
  }

  // Compare passwords
  const match = await bcrypt.compare(password, user.password);

  // If passwords don't match, throw error
  if (!match) {
    return next(new ErrorHandler("Invalid email or password", 401));
  }

  // Create JWT token
  const token = generateToken({ email: email, userId: String(user._id) });

  // const expireTime=new Date(Date.now() + 900000) // Token expires in 15 minutes
  const expireTime = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000); // Token expires in 15 days


  // Send token in response
  res
    .status(200)
    .cookie("token", token, {
      expires: expireTime,
      httpOnly: true,
    })
    .json({
      success: true,
      message: `Welcome ${user.name}`,
      data: { token: token, user: user },
    });
};

export const getUser = TryCatch(async (req, res, next) => {
  // Extract user ID from request parameters
  const { userId } = req.body;

  // Find user by ID in the database
  const user = await User.findById(userId);

  // If user not found, throw an error
  if (!user) next(new ErrorHandler("User not found", 404));

  // If user found, return user data
  res
    .status(200)
    .json({
      success: true,
      message: "Login successful using Token",
      data: user,
    });
});

export const newUser = TryCatch(async (req, res, next) => {

    const { email, password } = req.body;

    console.log("Email ", email, password);
    if (!email || !password)
      return next(
        new ErrorHandler("Please Enter all required parameters", 400)
      );

    // Find user by email
    const user = await User.findOne({ email });

    // If user  found, send error message
    if (user) return next(new ErrorHandler("User Already Exist", 400));

    // Find user by email
    const pending = await PendingUser.findOne({ email });

    // If pending found, send error message
    if (pending)
      return next(
        new ErrorHandler("Pending User Please check your Email to complete Verification ", 400)
      );

    const hashedPassword = await bcrypt.hash(password, 10);

    const verificationToken = generateToken({ email });

    const pendingUser = new PendingUser({
      email,
      password: hashedPassword,
      verificationToken,
    });
    await pendingUser.save();

    // Send verification email
    sendVerificationEmailSignup(email, verificationToken);

    return res.status(200).json({
      success: true,
      message: `Signup successful. Please verify your email : ${pendingUser.email} `,
    });
  }
);

export const completeUser = TryCatch(async (req, res, next) => {
  const { verifyToken, name, phone } = req.body;
  
  // Check for required parameters
  if (!verifyToken || !name || !phone) {
    return next(new ErrorHandler("Please provide all required parameters", 400));
  }

  // Find pending user by verification token
  const pendingUser = await PendingUser.findOne({ verificationToken: verifyToken });

  if (!pendingUser) {
    return next(new ErrorHandler("Invalid or expired verification token", 401));
  }

  // Check if a user with the email already exists
  const existingUser = await User.findOne({ email: pendingUser.email.toLowerCase() });
  if (existingUser) {
    return next(new ErrorHandler("User with this email already exists", 409));
  }

  // Create the actual user from pending user data, using the password from PendingUser
  const user = new User({
    name,
    email: pendingUser.email.toLowerCase(),
    password: pendingUser.password, // Use password from PendingUser
    phone,
  });

  // Save the new user to the database
  await user.save();

  // Delete the pending user entry
  await PendingUser.deleteOne({ _id: pendingUser._id });

  // Send response
  return res.status(201).json({
    success: true,
    message: "Account setup completed successfully.",
    data: { user },
  });
});



export const ForgotRequest = TryCatch(async (req, res, next) => {
  const { email } = req.body;

  console.log("Email ", email);
  if (!email) return next(new ErrorHandler("Please Enter Email", 400));

  // Find user by email
  const user = await User.findOne({ email });

  // If user not found, send error message
  if (!user) return next(new ErrorHandler("User Not Found", 400));

  // Find user by email
  const pending = await PendingUser.findOne({ email });

  // If pending found, send error message
  if (pending)
    return next(
      new ErrorHandler("Already Email sent  Please Check Your Email", 400)
    );

  const verificationToken = generateToken({ email });

  const pendingUser = new PendingUser({
    email,
    verificationToken,
  });

  await pendingUser.save();

  console.log("Verification Token ", verificationToken);

  // Send verification email
  sendVerificationEmail(email, verificationToken);

  return res.status(200).json({
    success: true,
    message: `Forgot Request successful. Please Check your email to change password : ${user.email} `,
  });
});

export const ResetPassword = TryCatch(async (req, res, next) => {
  const { verifyToken, password } = req.body;

  if (!verifyToken || !password) {
    return next(
      new ErrorHandler(
        "Invalid Request. Please provide token and new password",
        400
      )
    );
  }

  const pending = await PendingUser.findOne({ verificationToken: verifyToken });

  if (!pending) {
    return next(new ErrorHandler("Unable to find pending user", 400));
  }

  const user = await User.findOne({ email: pending.email });

  if (!user) {
    return next(new ErrorHandler("User not found. Please sign up", 401));
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  // Update user's password
  user.password = hashedPassword;
  await user.save();

  // Remove the pending user entry
  await PendingUser.deleteOne({ _id: pending._id });

  // Create JWT token
  const token = generateToken({ email: user.email, userId: String(user._id) });

  // Send token in response
  res
    .status(200)
    .cookie("token", token, {
      expires: new Date(Date.now() + 900000),
      httpOnly: true,
    })
    .json({
      success: true,
      message: "Password reset successful",
      token: token,
    });
});

// export const contact = TryCatch(async (req, res, next) => {
//   const { name, email, message } = req.body;

//   // Validate required fields
//   if (!name || !email || !message) {
//     return next(new ErrorHandler('All fields are required: name, email, message', 400));
//   }

//   // Create a new contact entry
//   const newContact = new Contact({
//     name,
//     email,
//     message
//   });

//   // Save contact data to the database
//   await newContact.save();

//   // Send response back to client
//   res.status(201).json({
//     success: true,
//     message: 'Contact information saved successfully!',
//     data: newContact
//   });
// });

export const updateKeywords = TryCatch(async (req, res, next) => {
  const { email, keywords } = req.body;

  // Validate required fields
  if (!email || !keywords) {
    return next(new ErrorHandler('Email and keywords are required', 400));
  }

  // Check if keywords is an array
  if (!Array.isArray(keywords)) {
    return next(new ErrorHandler('Keywords should be an array of strings', 400));
  }

  // Find user by email and update their keywords
  const user = await User.findOneAndUpdate(
    { email },  // Find user by email
    { keywords },  // Update the keywords field
    { new: true, runValidators: true }  // Return updated user and run validators
  );

  // If user not found, return an error
  if (!user) {
    return next(new ErrorHandler('User not found', 404));
  }

  // Send success response
  res.status(200).json({
    success: true,
    message: 'Keywords updated successfully!',
    data: user.keywords
  });
});

export const fetchKeywords = TryCatch(async (req, res, next) => {
  const { email } = req.query;  // Email passed via query params

  // Validate required fields
  if (!email) {
    return next(new ErrorHandler('Email is required to fetch keywords', 400));
  }

  // Find the user by email
  const user = await User.findOne({ email });

  // If user not found, return an error
  if (!user) {
    return next(new ErrorHandler('User not found', 404));
  }

  // Send success response with user's keywords
  res.status(200).json({
    success: true,
    message: 'User keywords fetched successfully!',
    data: user.keywords
  });
});


export const logout = (req, res) => {
  res.clearCookie("token").status(200).json({
    success: true,
    message: "LogOut",
  });
};



export const getProfile = TryCatch(async (req, res, next) => {
  const userId = req.user?.id || req.query.userId; // Assuming `req.user` is populated by middleware
  
  if (!userId) {
    return next(new ErrorHandler("User ID is required", 400));
  }

  const user = await User.findById(userId).select("-password"); // Exclude the password field

  if (!user) {
    return next(new ErrorHandler("User not found", 404));
  }

  res.status(200).json({
    success: true,
    message: "User profile fetched successfully",
    data: user,
  });
});


export const updateProfile = TryCatch(async (req, res, next) => {
  const userId = req.user?.id || req.query.userId; // Assuming `req.user` is populated by middleware
  
  if (!userId) {
    return next(new ErrorHandler("User ID is required", 400));
  }

  const { name, phone } = req.body;

  if (!name || !phone) {
    return next(new ErrorHandler("All fields (name, phone) are required", 400));
  }

  const updatedUser = await User.findByIdAndUpdate(
    userId,
    { name, phone },
    { new: true, runValidators: true } // Return updated document and run field validation
  ).select("-password");

  if (!updatedUser) {
    return next(new ErrorHandler("User not found", 404));
  }

  res.status(200).json({
    success: true,
    message: "Profile updated successfully",
    data: updatedUser,
  });
});

