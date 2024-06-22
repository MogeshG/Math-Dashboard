import express from 'express';
import { configDotenv } from 'dotenv';
import cors from 'cors';
import multer from 'multer';
import bodyParser from 'body-parser';
import mysql from 'mysql';
import bcrypt from 'bcrypt';
import path from 'path';
import jwt from 'jsonwebtoken';
import fs from 'fs';

configDotenv();

const app = express();

const deleteImageFile = async(filePath) => {
    try {
        const oldImagePath = path.join(process.cwd() + '/public/uploads/', filePath);
        fs.unlink(oldImagePath, (unlinkErr) => {
        if (unlinkErr) {
            console.error("Error deleting old image:", unlinkErr);
            return false;
        } else {
            console.log("Old image deleted:", oldImagePath);
            return true;
        }
        });
    } catch (error) {
      console.error('Error deleting file:', error);
      throw error;
    }
}

const deleteAvatar = async(filePath) => {
    try {
        const oldImagePath = path.join(process.cwd() + '/public/avatar/', filePath);
        fs.unlink(oldImagePath, (unlinkErr) => {
        if (unlinkErr) {
            console.error("Error deleting old image:", unlinkErr);
            return false;
        } else {
            console.log("Old image deleted:", oldImagePath);
            return true;
        }
        });
    } catch (error) {
      console.error('Error deleting file:', error);
      throw error;
    }
}

app.use(cors());
app.use(bodyParser.json({limit: '5mb'}));
app.use(bodyParser.urlencoded({extended: true}));

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, 'public/uploads/'); 
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});

const avatarStorage = multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, 'public/avatar/'); 
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    fileSize: 10000000 
});

const avatar = multer({
    storage: avatarStorage,
    fileSize: 5000
})

app.use('/public', express.static('public'));

const db = mysql.createPool({
    connectionLimit: 20,
    host: process.env.HOST,
    user: process.env.USER,
    password: process.env.PASSWORD,
    database: process.env.DATABASE,
    multipleStatements: true
});

//AUTHENTICATION

app.post('/login', (req, res)=> {
    try {
        const { email , password } = req.body;
        const query = 'SELECT * FROM users WHERE email = ?';
        db.query(query, [email], (error, result) => {
            if (error) {
                console.log(error);
                return res.status(500).json({ message: 'Internal server error' });
            }
            if (result.length === 0) {
                return res.status(404).json({ message: 'User not found' });
            }

            const id = result[0].id;

            const query2 = 'SELECT password FROM users WHERE id = ? AND deletedAt IS NULL';
            db.query(query2, [id], (error, data) => {
                if (error) {
                    console.log(error);
                    return res.status(500).json({ message: 'Internal server error' });
                }

                if (data.length === 0) {
                    return res.status(404).json({ message: 'User doesn\'t exist' });
                }

                if (bcrypt.compareSync(password, data[0].password)) {
                    const token = jwt.sign( {data: result[0]}, process.env.SECRET_KEY, { expiresIn: '3d' });
                    return res.status(200).json({ token: `BEARER ${token}` });
                } else {
                    return res.status(401).json({ message: 'Wrong password' });
                }
            });
        });
    } catch (error) {
        console.log(error);
        return res.status(500).json({ message: 'Internal server error' });
    }
});

//DATA
  
    //USER API's
app.get('/users', (req, res) => {
    const query = "SELECT u.*, GROUP_CONCAT(p.module ORDER BY p.id) AS all_modules, GROUP_CONCAT(p.id ORDER BY p.id) AS privilege_ids, GROUP_CONCAT(p.module ORDER BY p.id) AS modules FROM users AS u JOIN privileges AS p WHERE u.deletedAt IS NULL GROUP BY u.id ORDER BY u.id";
    db.query(query, (error, data) => {
        if(error) {
            console.log(error);
            res.status(500);
        } else {
            res.status(200).json(data);
        }
    });
});

app.post('/adduser', (req, res) => {
    const {name, email, password, role} = req.body;
    const query = 'SELECT email from users where email LIKE ?';
    db.query(query, email, (error, data) => {
        if(error) {
            console.log(error);
            res.status(500).json('Internal Server Error');
        } else {
            if(data.length !== 0) {
                res.status(200).json('exists');
            } else {
                const salt = bcrypt.genSaltSync(10);
                const hashedPassword = bcrypt.hashSync(password, salt);

                const query = 'INSERT INTO users (name, email, password, role , createdAt) VALUES (?, ?, ?, ?, NOW())';
                db.query(query, [name, email, hashedPassword, role], (error, data) => {
                    if(error) {
                        res.status(500).json('Internal Server Error');
                    } else {
                        res.status(200).json('success');
                    }
                });
            }
        }
    });
});

app.put('/editProfile', (req, res) => {
    const { name , email, id } = req.body;
    console.log(req.body)
    const query = 'UPDATE users set name=?, email=? WHERE id=?';
    db.query(query,[name, email, id], (error, data) => {
        if(error) {
            console.log(error);
            res.status(500).json('Unable to update... Please try again!');
        } else {
            res.status(200).json('success');
        }
    });
});

app.put('/changeprofilepic', avatar.single('profilepic'), (req, res) => {
    const { id, old } = req.body;
    if(old !== 'default.png')
        deleteAvatar(old);
    const file = req.file.filename;
    const query = 'UPDATE users SET avatar = ? WHERE id = ?';
    db.query(query, [file, id], (error, data) => {
        if(error) {
            console.log(error);
            res.status(500).json({message: 'Error uploading the Profile picture'});
        } else {
            db.query('SELECT * FROM users WHERE id = ?', id ,(error, result) => {
                if(error){ 
                     console.log(error);
                     res.status(500).json({message:'Internal Server Error'});
                } else {
                    const token = jwt.sign( {data: result[0]}, process.env.SECRET_KEY, { expiresIn: '3d' });
                    res.status(200).json({message: 'success', token : `BEARER ${token}`, image: file});
                }
            });
        }
    });
});

app.put('/removeprofilepic', (req, res) => {
    const { id, image } = req.body;
    let del = false;
    if(image !== 'default.png')
        del = deleteAvatar(image);
    if(del) {
        const query = 'UPDATE users SET avatar = ? WHERE id = ?';
        db.query(query, [null, id], (error, data) => {
            if(error) {
                console.log(error);
                res.status(500).json({message: 'Error uploading the Profile picture'});
            } else {
                db.query('SELECT * FROM users WHERE id = ?', id ,(error, result) => {
                    if(error){ 
                         console.log(error);
                         res.status(500).json({message:'Internal Server Error'});
                    } else {
                        const token = jwt.sign( {data: result[0]}, process.env.SECRET_KEY, { expiresIn: '3d' });
                        res.status(200).json({message: 'success', token : `BEARER ${token}`});
                    }
                });
            }
        });
    } else {
        res.status(500).json('Error deleting the image');
    }

});


app.put('/users/:id', async(req, res) => {
    const { id } = req.params;
    const { username,email, password, privileges } = req.body;
    let query;
    let values;
    if(password){
        const salt =await bcrypt.genSalt(10);
        let encryptedPassword =await bcrypt.hash(password,salt);
        query = `UPDATE users SET name=?,email=?, password=?, privileges=?, updatedAt=NOW() WHERE id=?`;
        values = [username, email, encryptedPassword, privileges, id];
    } else {
        query = `UPDATE users SET name=?,email=?, privileges=?, updatedAt=NOW() WHERE id=?`;
        values = [username, email, privileges, id];
    }
    db.query(query, values, (error, data) => {
      if (error) {
        console.error('Error updating user:', error);
        return res.status(500).json({ message: 'Internal server error' });
      }
      console.log('User updated successfully');
      return res.status(200).json('success');
    });
  });

app.delete('/deleteuser', (req, res) => { 
    const { id } = req.body;
    const query = 'UPDATE users SET deletedAt = NOW() WHERE id= ?';
    db.query(query, id, (error, data) => {
        if(error) {
            res.status(500).json('Internal Server Error');
        } else {
            res.status(200).json('success');
        }
    });
});

app.get('/changePassword', (req, res) => {
    const { id, password, newpassword } = req.headers;
    const query = 'SELECT password from users where id = ?';
    
    db.query(query, [id], (error, data) => {
        if (error) {
            console.log(error);
            return res.status(500).json('Error validating password');
        }

        if (data.length === 0) {
            return res.status(404).json('User not found');
        }

        if (bcrypt.compareSync(password, data[0].password)) {
            const salt = bcrypt.genSaltSync(10);
            const hashedPassword = bcrypt.hashSync(newpassword, salt);

            const updateQuery = `UPDATE users SET password = ? WHERE id = ?`;
            db.query(updateQuery, [hashedPassword, id], (error, result) => {
                if (error) {
                    console.log(error);
                    return res.status(500).json('Error updating password');
                }
                res.status(200).json('success');
            });
        } else {
            res.status(200).json('Current Password is wrong');
        }
    });
});

    //TOPIC API's
app.get('/topics', (req, res) => {
    const query = 'SELECT * FROM topics WHERE deletedAt IS NULL';
    db.query(query, (error, data) => {
        if(error) {
            console.log(error);
            res.status(500);
        } else {
            res.status(200).json(data);
        }
    });
});

app.delete('/deletetopic', (req, res) => { 
    const { id, logo } = req.body.elem;
    console.log(id, logo);
    const del = deleteImageFile(logo);
    if(del) {
        const query = 'UPDATE topics SET deletedAt = NOW() WHERE id= ?';
        const subtopicQuery = 'UPDATE subtopics SET deletedAt = NOW() WHERE topic_id = ?';
        const questionQuery = 'UPDATE questions SET deletedAt = NOW() WHERE topic_id = ?';
        db.query(query, id, (error, data) => {
            if(error) {
                res.status(500).json('Internal Server Error');
            } else {
                db.query(subtopicQuery, id, (error, data) => {
                    if(error) {
                        console.log(error);
                        res.status(500).json('Internal Server Error');
                    } else {
                        db.query(questionQuery, id, (error, data) => {
                            if(error) {
                                console.log(error)
                                res.status(500).json('Internal Server Error');
                            } else {
                                res.status(200).json('success');
                            }
                        });
                    }
                });
            }
        });
    } else {
        res.status(500).json('Error deleting the image');
    }
});

app.post('/addTopic', upload.single('logo'), (req, res) => {
    const data =JSON.parse(req.body.data); 
    const file = req.file.filename;
    const query = 'INSERT INTO topics (name, logo, description, grade, createdAt) VALUES (?, ?, ?, ?, NOW())';
    db.query(query, [data.name, file, data.description, data.grade], (error, data) => {
        if(error) {
            console.log(error);
            res.status(500).json({error: 'Error Occured'});
        } else {
            res.status(200).json('success');
        }
    });
});

app.put('/editTopic', upload.single('logo'), (req, res) => {
    const data = JSON.parse(req.body.data);
    const { name, description, grade, id } = data;
    const logo = req.file ? req.file.filename : null;
  
    let query;
    let values;
    if (logo) {
      query = 'UPDATE topics SET name = ?, description = ?, grade = ?, logo = ?, updatedAt = NOW() WHERE id = ?';
      values = [name, description, grade, logo, id];
    } else {
      query = 'UPDATE topics SET name = ?, description = ?, grade = ?, updatedAt = NOW() WHERE id = ?';
      values = [name, description, grade, id];
    }
  
    db.query(query, values, (err, result) => {
      if (err) {
        console.error(err);
        return res.status(500).send('An error occurred while updating the topic.');
      }
      res.send('success');
    });
});
  
  //SUbTOPIC API's
app.get('/subTopics', (req, res) => {
    const query = 'SELECT * FROM subtopics WHERE deletedAt IS NULL';
    db.query(query, (error, data) => {
        if(error) {
            console.log(error);
            res.status(500);
        } else {
            res.status(200).json(data);
        }
    });
});

app.put('/editSubTopic', (req, res) => {
    const values = req.body; 
    const { name, topic_id, description, grade, id } = values;
    const query = "UPDATE subtopics SET name = ?, topic_id = ?, description = ?, grade = ?, updatedAt = NOW() WHERE id = ?";
    db.query(query, [name, topic_id, description, grade, id], (error, data) => {
        if(error) {
            console.log(error);
            res.status(500).json({message: 'Error'});
        } else {
            res.status(200).json('success');
        }
    });
});

app.delete('/deletesubtopic', (req, res) => { 
    const { id } = req.body;
    const query = 'UPDATE subtopics SET deletedAt = NOW() WHERE id= ?';
    const questionQuery = 'UPDATE questions SET deletedAt = NOW() WHERE subtopic_id = ?';
    db.query(query, id, (error, data) => {
        if(error) {
            console.log(error)
            res.status(500).json('Internal Server Error');
        } else {
            db.query(questionQuery, id, (error, data) => {
                if(error) {
                    console.log(error)
                    res.status(500).json('Internal Server Error');
                } else {
                    res.status(200).json('success');
                }
            });
        }
    });
});

app.get('/subTopics/:topic', (req, res) => {
    const topic = req.params.topic;
    const query = 'SELECT * FROM subtopics WHERE topic_id = ? AND deletedAt IS NULL';
    db.query(query, topic, (error, data) => {
        if(error) {
            console.log(error);
            res.status(500).json({message:'Error'});
        } else{
            res.status(200).json(data);
        }
    })
});

app.post('/addSubTopic', (req, res) => {
    const data = req.body;
    const query = 'INSERT INTO subtopics (name, topic_id, description, grade, createdAt) VALUES (?, ?, ?, ?, NOW())';
    db.query(query, [data.name, data.topic_id, data.description, data.grade], (error, data) => {
        if(error) {
            console.log(error);
            res.status(500).json({message: 'Error'});
        } else {
            res.status(200).json('success');
        }
    });
});

    //QUESTION API's
app.get('/questions', (req, res) => {
    const query = 'SELECT * FROM questions WHERE deletedAt IS NULL';
    db.query(query, (error, data ) => {
        if(error) {
            console.log(error);
            res.status(500).json({message: 'error'});
        } else {
            res.status(200).json(data);
        }
    });
});

app.post('/addQuestion', (req, res) => {
    const data = req.body;
    const query = 'INSERT INTO questions (topic_id, subtopic_id, title, val1, symbol1, val2, symbol2, val3, op1, op2, op3, op4, op5, op6, answer, hint, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())';
    db.query(query, [data.topic_id, data.subtopic_id, data.title, data.val1, data.symbol1, data.val2, data.symbol2, data.val3, data.op1, data.op2, data.op3, data.op4, data.op5, data.op6, data.answer, data.hint], (error, data) => {
        if(error) {
            console.log(error);
            res.status(500).json({message: 'Error'});
        } else {
            res.status(200).json('success');
        }
    });
});

app.put('/editQuestion', (req, res) => {
    const data = req.body;
    const query = 'UPDATE questions SET topic_id = ?, subtopic_id = ?, title = ?, val1 = ?, symbol1 = ?, val2 = ?, symbol2 = ?, val3 = ?, op1 = ?, op2 = ?, op3 = ?, op4 = ?, op5 = ?, op6 = ?, answer = ?, hint = ?, updatedAt = NOW() WHERE id = ?';
    db.query(query, [data.topic_id, data.subtopic_id, data.title, data.val1, data.symbol1, data.val2, data.symbol2, data.val3, data.op1, data.op2, data.op3, data.op4, data.op5, data.op6, data.answer, data.hint, data.id], (error, data) => {
        if(error) {
            console.log(error);
            res.status(500).json({message: 'Error'});
        } else {
            res.status(200).json('success');
        }
    });
});

app.delete('/deleteQuestion', (req, res) => {
    const { id } = req.body;
    const query = 'UPDATE questions SET deletedAt = NOW() WHERE id= ?';
    db.query(query, id, (error, data) => {
        if(error) {
            res.status(500).json('Internal Server Error');
        } else {
            res.status(200).json('success');
        }
    });
});

    //REPORTS API's
app.get('/reports', (req, res) => {
    const query = 'SELECT * FROM reports WHERE deletedAt IS NULL';
    db.query(query, (error, data) => {
        if(error) {
            console.log(error);
            res.status(500);
        } else {
            res.status(200).json(data);
        }
    });
});

    //TOPIC RESULTS API's
app.get('/topicResults')

app.listen(process.env.SERVER_PORT, () => {
    console.log(`Server running at ${process.env.SERVER_ADDRESS}:${process.env.SERVER_PORT}`);
});


////////////////////////////////////////////////////////////////////////////////////////////////////


app.post('/api/login', (req, res)=> {
    try {
        const { email , password } = req.body;
        const query = 'SELECT * FROM customers WHERE email = ?';
        db.query(query, [email], (error, result) => {
            if (error) {
                console.log(error);
                return res.status(500).json({
                    result: 0,
                    data: data,
                    message: 'Internal server error',
                });
            }
            if (result.length === 0) {
                return res.status(404).json({
                    result: 0,
                    data: [],
                    message: 'User not found' 
                });
            }
            if (bcrypt.compareSync(password, result[0].password)) {
                const token = jwt.sign({data: result[0]}, process.env.SECRET_KEY, { expiresIn: '3d' });
                return res.status(200).json({
                    result: 1,
                    data: `BEARER ${token}`,
                    message: 'Login Successful'
                });
            } else {
                return res.status(401).json({
                    result: 0,
                    data: [],
                    message: 'Wrong password' 
                });
            }
        });
    } catch (error) {
        console.log(error);
        return res.status(500).json({
            result: 0,
            data: [],
            message: 'Internal server error' 
        });
    }
});

//GET Request
app.get('/api/users', (req, res) => {
    const query = "SELECT * FROM customers WHERE deletedAt IS NULL";
    db.query(query, (error, data) => {
        if(error) {
            console.log(error);
            res.status(500).json({
                result: 0,
                data: [],
                message: error
            });
        } else {
            res.status(200).json({
                result: 1,
                data: data,
                message: 'Data fetched successfully'
            });
        }
    });
});

app.get('/api/topics', (req, res) => {
    const query = 'SELECT * FROM topics WHERE deletedAt IS NULL';
    db.query(query, (error, data) => {
        if(error) {
            console.log(error);
            res.status(500).json({
                result: 0,
                data: [],
                message: error
            });
        } else {
            res.status(200).json({
                result: 1,
                data: data,
                message: 'Data fetched successfully'
            });
        }
    });
});

app.get('/api/subTopics', (req, res) => {
    const query = 'SELECT * FROM subtopics WHERE deletedAt IS NULL';
    db.query(query, (error, data) => {
        if(error) {
            console.log(error);
            res.status(500).json({
                result: 0,
                data: [],
                message: error
            });
        } else {
            res.status(200).json({
                result: 1,
                data: data,
                message: 'Data fetched successfully'
            });
        }
    });
});

app.get('/api/questions', (req, res) => {
    const query = 'SELECT * FROM questions WHERE deletedAt IS NULL';
    db.query(query, (error, data ) => {
        if(error) {
            console.log(error);
            res.status(500).json({
                result: 0,
                data: [],
                message: error
            });
        } else {
            res.status(200).json({
                result: 1,
                data: data,
                message: 'Data fetched successfully'
            });
        }
    });
});

app.get('/api/reports', (req, res) => {
    const query = 'SELECT * FROM reports WHERE deletedAt IS NULL';
    db.query(query, (error, data ) => {
        if(error) {
            console.log(error);
            res.status(500).json({
                result: 0,
                data: [],
                message: error
            });
        } else {
            res.status(200).json({
                result: 1,
                data: data,
                message: 'Data fetched successfully'
            });
        }
    });
});

app.get('/api/topicreports', (req, res) => {
    const query = 'SELECT * FROM topic_reports WHERE deletedAt IS NULL';
    db.query(query, (error, data ) => {
        if(error) {
            console.log(error);
            res.status(500).json({
                result: 0,
                data: [],
                message: error
            });
        } else {
            res.status(200).json({
                result: 1,
                data: data,
                message: 'Data fetched successfully'
            });
        }
    });
});

//POST requests

app.post('/api/customerEmail', (req, res) => {
    const email = req.body.email;
    const query = "SELECT * FROM customers WHERE email = ? AND deletedAt IS NULL";
    db.query(query, [email], (error, data) => {
        if(error) {
            console.log(error);
            res.status(500).json({
                result: 0,
                data: [],
                message: error
            });
        } else {
            res.status(200).json({
                result: 1,
                data: data,
                message: 'Data fetched successfully'
            });
        }
    });
});

app.post('/api/customerid', (req, res) => {
    const id = req.body.id;
    const query = "SELECT * FROM customers WHERE id = ? AND deletedAt IS NULL";
    db.query(query, [id], (error, data) => {
        if(error) {
            console.log(error);
            res.status(500).json({
                result: 0,
                data: [],
                message: error
            });
        } else {
            res.status(200).json({
                result: 1,
                data: data,
                message: 'Data fetched successfully'
            });
        }
    });
});

app.post('/api/customername', (req, res) => {
    const name = req.body.name;
    const query = "SELECT * FROM customers WHERE name = ? AND deletedAt IS NULL";
    db.query(query, [name], (error, data) => {
        if(error) {
            console.log(error);
            res.status(500).json({
                result: 0,
                data: [],
                message: error
            });
        } else {
            res.status(200).json({
                result: 1,
                data: data,
                message: 'Data fetched successfully'
            });
        }
    });
});

app.post('/api/topicid', (req, res) => {
    const id = req.body.id;
    const query = "SELECT * FROM topics WHERE id = ? AND deletedAt IS NULL";
    db.query(query, [id], (error, data) => {
        if(error) {
            console.log(error);
            res.status(500).json({
                result: 0,
                data: [],
                message: error
            });
        } else {
            res.status(200).json({
                result: 1,
                data: data,
                message: 'Data fetched successfully'
            });
        }
    });
});

app.post('/api/topicname', (req, res) => {
    const name = req.body.name;
    const query = "SELECT * FROM topics WHERE name = ? AND deletedAt IS NULL";
    db.query(query, [name], (error, data) => {
        if(error) {
            console.log(error);
            res.status(500).json({
                result: 0,
                data: [],
                message: error
            });
        } else {
            res.status(200).json({
                result: 1,
                data: data,
                message: 'Data fetched successfully'
            });
        }
    });
});

app.post('/api/topicgrade', (req, res) => {
    const grade = req.body.grade;
    const query = "SELECT * FROM topics WHERE grade = ? AND deletedAt IS NULL";
    db.query(query, [grade], (error, data) => {
        if(error) {
            console.log(error);
            res.status(500).json({
                result: 0,
                data: [],
                message: error
            });
        } else {
            res.status(200).json({
                result: 1,
                data: data,
                message: 'Data fetched successfully'
            });
        }
    });
});

app.post('/api/subtopicid', (req, res) => {
    const id = req.body.id;
    const query = "SELECT * FROM subtopics WHERE id = ? AND deletedAt IS NULL";
    db.query(query, [id], (error, data) => {
        if(error) {
            console.log(error);
            res.status(500).json({
                result: 0,
                data: [],
                message: error
            });
        } else {
            res.status(200).json({
                result: 1,
                data: data,
                message: 'Data fetched successfully'
            });
        }
    });
});

app.post('/api/subtopicname', (req, res) => {
    const name = req.body.name;
    const query = "SELECT * FROM subtopics WHERE name = ? AND deletedAt IS NULL";
    db.query(query, [name], (error, data) => {
        if(error) {
            console.log(error);
            res.status(500).json({
                result: 0,
                data: [],
                message: error
            });
        } else {
            res.status(200).json({
                result: 1,
                data: data,
                message: 'Data fetched successfully'
            });
        }
    });
});

app.post('/api/subtopicgrade', (req, res) => {
    const grade = req.body.grade;
    const query = "SELECT * FROM subtopics WHERE grade = ? AND deletedAt IS NULL";
    db.query(query, [grade], (error, data) => {
        if(error) {
            console.log(error);
            res.status(500).json({
                result: 0,
                data: [],
                message: error
            });
        } else {
            res.status(200).json({
                result: 1,
                data: data,
                message: 'Data fetched successfully'
            });
        }
    });
});

app.post('/api/questionid', (req, res) => {
    const id = req.body.id;
    const query = "SELECT * FROM questions WHERE id = ? AND deletedAt IS NULL";
    db.query(query, [id], (error, data) => {
        if(error) {
            console.log(error);
            res.status(500).json({
                result: 0,
                data: [],
                message: error
            });
        } else {
            res.status(200).json({
                result: 1,
                data: data,
                message: 'Data fetched successfully'
            });
        }
    });
});

app.post('/api/questiontitle', (req, res) => {
    const title = req.body.title;
    const query = "SELECT * FROM questions WHERE title = ? AND deletedAt IS NULL";
    db.query(query, [title], (error, data) => {
        if(error) {
            console.log(error);
            res.status(500).json({
                result: 0,
                data: [],
                message: error
            });
        } else {
            res.status(200).json({
                result: 1,
                data: data,
                message: 'Data fetched successfully'
            });
        }
    });
});

app.post('/api/reportid', (req, res) => {
    const id = req.body.id;
    const query = "SELECT * FROM reports WHERE id = ? AND deletedAt IS NULL";
    db.query(query, [id], (error, data) => {
        if(error) {
            console.log(error);
            res.status(500).json({
                result: 0,
                data: [],
                message: error
            });
        } else {
            res.status(200).json({
                result: 1,
                data: data,
                message: 'Data fetched successfully'
            });
        }
    });
});

app.post('/api/topicreport/userid', (req, res) => {
    const id = req.body.id;
    const query = "SELECT * FROM topic_reports WHERE user_id = ? AND deletedAt IS NULL";
    db.query(query, [id], (error, data) => {
        if(error) {
            console.log(error);
            res.status(500).json({
                result: 0,
                data: [],
                message: error
            });
        } else {
            res.status(200).json({
                result: 1,
                data: data,
                message: 'Data fetched successfully'
            });
        }
    });
});

app.post('/api/report/userid/topicid', (req, res) => {
    const userid = req.body.userid;
    const topicid = req.body.topicid;
    const query = "SELECT * FROM topic_reports WHERE user_id = ? AND topic_id = ? AND deletedAt IS NULL";
    db.query(query, [userid, topicid], (error, data) => {
        if(error) {
            console.log(error);
            res.status(500).json({
                result: 0,
                data: [],
                message: error
            });
        } else {
            res.status(200).json({
                result: 1,
                data: data,
                message: 'Data fetched successfully'
            });
        }
    });
});

app.post('/api/adduser', (req, res) => {
    const {name, age, email, password } = req.body;

    const errors = [];
                
    const uppercaseRegex = /^(?=.*[A-Z]).+$/;
    const lowercaseRegex = /^(?=.*[a-z]).+$/;
    const digitRegex = /^(?=.*\d).+$/;
    const specialCharRegex = /^(?=.*[@$!%*?&]).+$/;
    const lengthRegex = /^.{8,}$/;

    if (!uppercaseRegex.test(password)) {
        errors.push('Uppercase letter');
    }
    if (!lowercaseRegex.test(password)) {
        errors.push('Lowercase letter');
    }
    if (!digitRegex.test(password)) {
        errors.push('One digit');
    }
    if (!specialCharRegex.test(password)) {
        errors.push('Special character (@$!%*?&)');
    }
    if (!lengthRegex.test(password)) {
        errors.push('8 characters long');
    }

    if (errors.length > 0) {
        res.status(200).json({
            result: 0,
            data: errors,
            message: 'Password conditions not met'
        });
    } else {
        const query = 'SELECT email from customers where email LIKE ?';
        db.query(query, email, (error, data) => {
            if(error) {
                console.log(error);
                res.status(500).json({
                    result: 0,
                    data: error,
                    message: 'User Not created'
                });
            } else {
                if(data.length !== 0) {
                    res.status(200).json({
                        result: 0,
                        data: 'Email already exists',
                        message: 'User Not created'
                    });
                } else {
                    const salt = bcrypt.genSaltSync(10);
                    const hashedPassword = bcrypt.hashSync(password, salt);
    
                    const query = 'INSERT INTO customers (name, age, email, password , createdAt) VALUES (?, ?, ?, ?, NOW())';
                    db.query(query, [name, age, email, hashedPassword], (error, data) => {
                        if(error) {
                            res.status(500).json({
                                result: 0,
                                data: error,
                                message: 'User Not created'
                            });
                        } else {
                            res.status(200).json({
                                result: 0,
                                data: 'success',
                                message: 'User created'
                            });
                        }
                    });
                }
            }
        });
    }


    
});

//PUT
app.put('/api/edituser', (req, res) => {
    const { id, name, age, email, password } = req.body;
    const errors = [];
                
    const uppercaseRegex = /^(?=.*[A-Z]).+$/;
    const lowercaseRegex = /^(?=.*[a-z]).+$/;
    const digitRegex = /^(?=.*\d).+$/;
    const specialCharRegex = /^(?=.*[@$!%*?&]).+$/;
    const lengthRegex = /^.{8,}$/;
    let col = [];
    let data = [];
    if(name){
        col.push('name = ?');
        data.push(name);
    }
    if(age){
        col.push('age = ?');
        data.push(age);
    }
    if(email) {
        col.push('email = ?');
        data.push(email);
    }
    if(password) {
        if (!uppercaseRegex.test(password)) {
            errors.push('Uppercase letter');
        }
        if (!lowercaseRegex.test(password)) {
            errors.push('Lowercase letter');
        }
        if (!digitRegex.test(password)) {
            errors.push('One digit');
        }
        if (!specialCharRegex.test(password)) {
            errors.push('Special character (@$!%*?&)');
        }
        if (!lengthRegex.test(password)) {
            errors.push('8 characters long');
        }
    
        if (errors.length > 0) {
            res.status(200).json({
                result: 0,
                data: errors,
                message: 'Password conditions not met'
            });
        } else{
            col.push('password = ?');     
            const salt = bcrypt.genSaltSync(10);
            const hashedPassword = bcrypt.hashSync(password, salt);
            data.push(hashedPassword);
        }
    }
    const query = `UPDATE customers set ${[...col]} WHERE id=?`;
    db.query(query,[...data, id], (error, data) => {
        if(error) {
            console.log(error);
            res.status(500).json({
                result: 0,
                data: 'Unable to update... Please try again!',
                message: 'User not updated'
            });
        } else {
            res.status(200).json({
                result: 1,
                data: 'success',
                message: 'User updated'
            });
        }
    });
});

//DELETE
app.delete('/api/deleteuser', (req, res) => { 
    const { id } = req.body;
    const query = 'UPDATE customers SET deletedAt = NOW() WHERE id= ?';
    db.query(query, id, (error, data) => {
        if(error) {
            console.log(error);
            res.status(500).json({
                result: 0,
                data: [],
                message: error
            });
        } else {
            res.status(200).json({
                result: 1,
                data: 'success',
                message: 'Data Deleted successfully'
            });
        }
    });
});

app.delete('/api/resetreport', (req, res) =>{
    const id =req.body.id;
    const query = `
        START TRANSACTION;
        UPDATE reports SET deletedAt = NOW() WHERE id = ?;
        UPDATE topic_reports SET deletedAt = NOW() WHERE id = ?;
        COMMIT;
    `;

    db.query(query, [id, id], (error, results) => {
        if (error) {
            console.log(error);
            db.query('ROLLBACK');
            res.status(500).json({
                result: 0,
                data: [],
                message: error
            });
        } else {
            res.status(200).json({
                result: 1,
                data: 'success',
                message: 'Data Deleted successfully'
            });
        }
    });
});
